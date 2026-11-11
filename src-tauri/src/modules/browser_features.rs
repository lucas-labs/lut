//! Keeps WebView2's browser features out of lut's windows (E13-14).
//!
//! WebView2 behaves like a browser wherever the page does not take over:
//! - a key the page leaves unhandled runs its browser action: `Ctrl+P` prints, `Ctrl+F` finds on the page, `Ctrl+R`
//!   and `F5` reload the whole app (with focus outside a terminal, `Ctrl+P` opened the print dialog);
//! - a right click the page leaves unhandled opens the browser's context menu (back, reload, save as, print...).
//!
//! Tauri exposes neither setting, so each window hooks the WebView2 events. Keys: the browser action is turned off
//! per key, and the page still receives every key, so lut's own shortcuts on those keys keep working. Context menu:
//! only the text editing items stay (cut, copy, paste...), and no menu opens when none is left. Debug builds keep the
//! DevTools keys and "Inspect".
//!
//! macOS and Linux webviews have no such shortcuts or menu: there it does nothing.

use tauri::{Runtime, WebviewWindow};

const VK_F12: u32 = 0x7B;
const VK_I: u32 = 0x49;

/// Whether a key keeps its browser action: only the DevTools keys (`F12`, `Ctrl+Shift+I`), and only in debug
/// builds.
pub fn keeps_browser_action(virtual_key: u32, ctrl: bool, shift: bool, debug: bool) -> bool {
    debug && (virtual_key == VK_F12 || (ctrl && shift && virtual_key == VK_I))
}

/// Names of the WebView2 context menu items that are kept: text editing, plus "Inspect" in debug builds.
fn keeps_menu_item(name: &str, debug: bool) -> bool {
    matches!(
        name,
        "cut" | "copy" | "paste" | "pasteAndMatchStyle" | "selectAll" | "undo" | "redo" | "emoji"
    ) || (debug && name == "inspectElement")
}

/// One context menu entry: its WebView2 name, or `None` for a separator.
pub type MenuEntry<'a> = Option<&'a str>;

/// Which entries of a context menu stay, in order. Separators stay only between two kept items, once.
pub fn kept_menu_entries(entries: &[MenuEntry], debug: bool) -> Vec<bool> {
    let mut keep: Vec<bool> = entries
        .iter()
        .map(|entry| entry.is_some_and(|name| keeps_menu_item(name, debug)))
        .collect();
    let mut item_before = false;
    let mut pending_separator: Option<usize> = None;
    for (index, entry) in entries.iter().enumerate() {
        match entry {
            None => {
                if item_before && pending_separator.is_none() {
                    pending_separator = Some(index);
                }
            }
            Some(_) if keep[index] => {
                if let Some(separator) = pending_separator.take() {
                    keep[separator] = true;
                }
                item_before = true;
            }
            Some(_) => {}
        }
    }
    keep
}

/// Turns off the browser shortcuts and context menu of `window`'s webview. Failures are logged; the window keeps
/// working.
pub fn disable<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(windows)]
    {
        let label = window.label().to_owned();
        let result = window.with_webview(move |platform| {
            let controller = platform.controller();
            if let Err(error) = unsafe { windows::install_keys(&controller) } {
                log::warn!("could not turn off browser shortcuts in {label}: {error}");
            }
            if let Err(error) = unsafe { windows::install_context_menu(&controller) } {
                log::warn!("could not trim the browser context menu in {label}: {error}");
            }
        });
        if let Err(error) = result {
            log::warn!("could not reach the {} webview: {error}", window.label());
        }
    }
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
mod windows {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2AcceleratorKeyPressedEventArgs2, ICoreWebView2ContextMenuRequestedEventArgs,
        ICoreWebView2Controller, ICoreWebView2_11, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND,
        COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR,
    };
    use webview2_com::{
        take_pwstr, AcceleratorKeyPressedEventHandler, ContextMenuRequestedEventHandler,
    };
    use windows_core::{Interface, PWSTR};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CONTROL, VK_SHIFT};

    const DEBUG: bool = cfg!(debug_assertions);

    fn is_down(key: u16) -> bool {
        // The high bit of GetKeyState is set while the key is down.
        unsafe { GetKeyState(i32::from(key)) < 0 }
    }

    /// Registers the key handler for the life of the controller.
    ///
    /// # Safety
    ///
    /// Must run on the webview's thread, as `with_webview` callbacks do.
    pub unsafe fn install_keys(controller: &ICoreWebView2Controller) -> windows_core::Result<()> {
        let handler = AcceleratorKeyPressedEventHandler::create(Box::new(|_, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let mut key = 0;
            unsafe { args.VirtualKey(&mut key)? };
            let keep =
                super::keeps_browser_action(key, is_down(VK_CONTROL), is_down(VK_SHIFT), DEBUG);
            // Runtimes older than 1.0.1293 lack the per-key switch; their browser shortcuts stay as they were.
            if let Ok(args) = args.cast::<ICoreWebView2AcceleratorKeyPressedEventArgs2>() {
                unsafe { args.SetIsBrowserAcceleratorKeyEnabled(keep)? };
            }
            Ok(())
        }));
        let mut token = 0;
        unsafe { controller.add_AcceleratorKeyPressed(&handler, &mut token) }
    }

    /// Registers the context menu handler for the life of the webview.
    ///
    /// # Safety
    ///
    /// Must run on the webview's thread, as `with_webview` callbacks do.
    pub unsafe fn install_context_menu(
        controller: &ICoreWebView2Controller,
    ) -> windows_core::Result<()> {
        // Runtimes older than 1.0.1185 lack the event; their menu stays as it was.
        let Ok(webview) = (unsafe { controller.CoreWebView2()? }).cast::<ICoreWebView2_11>() else {
            return Ok(());
        };
        let handler = ContextMenuRequestedEventHandler::create(Box::new(|_, args| {
            let Some(args) = args else {
                return Ok(());
            };
            // Fail closed: if the menu cannot be read or trimmed, no browser menu opens.
            if let Err(error) = unsafe { trim_menu(&args) } {
                log::warn!("could not trim the browser context menu: {error}");
                unsafe { args.SetHandled(true)? };
            }
            Ok(())
        }));
        let mut token = 0;
        unsafe { webview.add_ContextMenuRequested(&handler, &mut token) }
    }

    /// Leaves only the kept items in the requested menu, or suppresses it when none is left.
    ///
    /// # Safety
    ///
    /// Must run inside the `ContextMenuRequested` handler.
    unsafe fn trim_menu(
        args: &ICoreWebView2ContextMenuRequestedEventArgs,
    ) -> windows_core::Result<()> {
        let items = unsafe { args.MenuItems()? };
        let mut count = 0;
        unsafe { items.Count(&mut count)? };
        let mut names = Vec::with_capacity(count as usize);
        for index in 0..count {
            let item = unsafe { items.GetValueAtIndex(index)? };
            let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND::default();
            unsafe { item.Kind(&mut kind)? };
            if kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR {
                names.push(None);
            } else {
                let mut name = PWSTR::null();
                unsafe { item.Name(&mut name)? };
                names.push(Some(take_pwstr(name)));
            }
        }
        let entries: Vec<_> = names.iter().map(Option::as_deref).collect();
        let keep = super::kept_menu_entries(&entries, DEBUG);
        // Remove from the end so the remaining indices stay valid.
        for index in (0..count).rev() {
            if !keep[index as usize] {
                unsafe { items.RemoveValueAtIndex(index)? };
            }
        }
        if !keep.contains(&true) {
            unsafe { args.SetHandled(true)? };
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VK_P: u32 = 0x50;
    const VK_R: u32 = 0x52;
    const VK_F5: u32 = 0x74;

    #[test]
    fn browser_actions_are_off_in_release() {
        for (key, ctrl, shift) in [
            (VK_P, true, false),
            (VK_R, true, false),
            (VK_F5, false, false),
            (VK_F12, false, false),
            (VK_I, true, true),
        ] {
            assert!(
                !keeps_browser_action(key, ctrl, shift, false),
                "key {key:#x}"
            );
        }
    }

    #[test]
    fn debug_builds_keep_only_the_devtools_keys() {
        assert!(keeps_browser_action(VK_F12, false, false, true));
        assert!(keeps_browser_action(VK_I, true, true, true));
        assert!(!keeps_browser_action(VK_I, true, false, true));
        assert!(!keeps_browser_action(VK_P, true, false, true));
        assert!(!keeps_browser_action(VK_F5, false, false, true));
    }

    #[test]
    fn page_menu_loses_every_browser_item() {
        let menu = [
            Some("back"),
            Some("forward"),
            Some("reload"),
            None,
            Some("saveAs"),
            Some("print"),
            None,
            Some("inspectElement"),
        ];
        assert_eq!(kept_menu_entries(&menu, false), vec![false; menu.len()]);
    }

    #[test]
    fn text_field_menu_keeps_editing_items_and_one_separator_between_them() {
        let menu = [
            Some("emoji"),
            None,
            Some("undo"),
            Some("redo"),
            None,
            None,
            Some("cut"),
            Some("copy"),
            Some("paste"),
            None,
            Some("print"),
            None,
        ];
        assert_eq!(
            kept_menu_entries(&menu, false),
            vec![true, true, true, true, true, false, true, true, true, false, false, false]
        );
    }

    #[test]
    fn debug_builds_keep_inspect() {
        let menu = [Some("copy"), None, Some("inspectElement")];
        assert_eq!(kept_menu_entries(&menu, true), vec![true, true, true]);
        assert_eq!(kept_menu_entries(&menu, false), vec![true, false, false]);
    }
}
