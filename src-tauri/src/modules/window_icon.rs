//! Gives lut's windows the app icon at the size the Windows taskbar draws it.
//!
//! Tauri sets each window's icon from the executable's icon at the system's large icon size (32 px at 100 %), as a
//! single image. The taskbar draws that icon at 24 px, so it shrinks the 32 px image, and the artwork's own 24 px
//! export is never used: the pixel art comes out blurred. Each window gets the executable's entry for the taskbar
//! size at its own scale instead, again whenever its scale changes (moved to another monitor).
//!
//! macOS and Linux take the bundle icons as they are: there it does nothing.

use tauri::{Runtime, WebviewWindow};

/// The default taskbar's icon size in px at 100 % (Windows 10 and 11).
const TASKBAR_ICON_SIZE: f64 = 24.0;

/// The taskbar's icon size in physical px at a display scale.
pub fn taskbar_icon_size(scale_factor: f64) -> u32 {
    (TASKBAR_ICON_SIZE * scale_factor).round() as u32
}

/// Sets the window's icon for the taskbar now and whenever the window's scale changes.
pub fn install<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(windows)]
    {
        if let Ok(scale_factor) = window.scale_factor() {
            apply(window, scale_factor);
        }
        let target = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::ScaleFactorChanged { scale_factor, .. } = event {
                apply(&target, *scale_factor);
            }
        });
    }
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
fn apply<R: Runtime>(window: &WebviewWindow<R>, scale_factor: f64) {
    let size = taskbar_icon_size(scale_factor);
    let result =
        tauri::image::Image::from_app_icon_resource(size).and_then(|icon| window.set_icon(icon));
    if let Err(error) = result {
        log::warn!("could not set the {size} px window icon: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_taskbar_icon_follows_the_display_scale() {
        assert_eq!(taskbar_icon_size(1.0), 24);
        assert_eq!(taskbar_icon_size(1.25), 30);
        assert_eq!(taskbar_icon_size(1.5), 36);
        assert_eq!(taskbar_icon_size(1.75), 42);
        assert_eq!(taskbar_icon_size(2.0), 48);
    }
}
