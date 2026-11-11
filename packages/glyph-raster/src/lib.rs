//! Hinted glyph rasterizer for lut's terminal, built to WebAssembly.
//!
//! The webview's 2D canvas draws text without grid fitting: a vertical stem that falls between two
//! pixels comes out as two grey pixels, so terminal text looks soft next to native terminals. This
//! crate hints each glyph (the font's TrueType instructions when it has them, the automatic hinter
//! otherwise) and fills it into an 8-bit coverage mask the terminal's glyph atlas takes as is.
//!
//! The interface is a handful of C ABI exports over the module's linear memory:
//! - `lut_alloc` / `lut_free`: buffers the host fills with font bytes;
//! - `lut_font_load` / `lut_font_drop`: one face of a font file becomes a numeric handle;
//! - `lut_font_has_weight_axis`: whether `lut_rasterize`'s weight applies to the face;
//! - `lut_font_glyph`: the glyph a code point maps to, 0 when the font lacks it;
//! - `lut_rasterize`: one glyph at one size and weight, into the result buffer;
//! - `lut_result_header` / `lut_result_pixels`: where that result lives.

use std::cell::RefCell;
use std::collections::HashMap;

use skrifa::instance::{Location, LocationRef, Size};
use skrifa::outline::{
    DrawSettings, Engine, HintingInstance, HintingOptions, OutlinePen, SmoothMode, Target,
};
use skrifa::raw::types::Tag;
use skrifa::raw::TableProvider;
use skrifa::{FontRef, GlyphId, MetadataProvider};
use zeno::{Command, Format, Mask, PathBuilder, Stroke, Vector};

/// `lut_rasterize` flag: grid-fit the outline before filling it.
pub const FLAG_HINT: u32 = 1;
/// `lut_rasterize` flag: thicken the outline, for a bold the font has no face for.
pub const FLAG_EMBOLDEN: u32 = 2;
/// `lut_rasterize` flag: slant the outline, for an italic the font has no face for.
pub const FLAG_OBLIQUE: u32 = 4;

/// Horizontal shift per unit of height of a synthesized oblique (about 11 degrees, as browsers do).
const OBLIQUE_SLANT: f32 = 0.2;
/// Extra stem weight of a synthesized bold, per pixel of font size (FreeType's emboldening ratio).
const EMBOLDEN_PER_PX: f32 = 1.0 / 24.0;

const WGHT: Tag = Tag::new(b"wght");

struct LoadedFont {
    data: Box<[u8]>,
    index: u32,
    /// The font carries its own hinting program; otherwise the automatic hinter is used.
    has_instructions: bool,
    has_weight_axis: bool,
    hinting: HashMap<(u32, u32), HintingInstance>,
}

#[derive(Default)]
struct State {
    fonts: Vec<Option<LoadedFont>>,
    /// `[width, height, left, top]`: the mask's size and the offset of its top-left pixel from the
    /// pen at the baseline (y grows downwards).
    header: [i32; 4],
    pixels: Vec<u8>,
    path: Vec<Command>,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State::default());
}

/// Allocates `len` bytes the host writes into; release them with `lut_free`.
#[no_mangle]
pub extern "C" fn lut_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// Releases a buffer from `lut_alloc`.
///
/// # Safety
///
/// `pointer` and `len` must come from one `lut_alloc` call, released once.
#[no_mangle]
pub unsafe extern "C" fn lut_free(pointer: *mut u8, len: usize) {
    drop(unsafe { Vec::from_raw_parts(pointer, 0, len) });
}

/// Takes the `len` bytes at `pointer` (from `lut_alloc`, released here) as a font file and loads
/// its face `index` (0 unless the file is a collection). Returns a handle above 0, or 0 when the
/// bytes hold no such face with outlines.
///
/// # Safety
///
/// `pointer` and `len` must come from one `lut_alloc` call, with `len` bytes written.
#[no_mangle]
pub unsafe extern "C" fn lut_font_load(pointer: *mut u8, len: usize, index: u32) -> u32 {
    let data = unsafe { Vec::from_raw_parts(pointer, len, len) }.into_boxed_slice();
    match LoadedFont::new(data, index) {
        Some(font) => STATE.with_borrow_mut(|state| {
            state.fonts.push(Some(font));
            state.fonts.len() as u32
        }),
        None => 0,
    }
}

/// Releases a font handle.
#[no_mangle]
pub extern "C" fn lut_font_drop(font: u32) {
    STATE.with_borrow_mut(|state| {
        if let Some(slot) = state.fonts.get_mut((font as usize).wrapping_sub(1)) {
            *slot = None;
        }
    });
}

/// Whether `font` has a weight axis, so `lut_rasterize` draws the weight it is given.
#[no_mangle]
pub extern "C" fn lut_font_has_weight_axis(font: u32) -> u32 {
    STATE.with_borrow(|state| u32::from(state.font(font).is_some_and(|font| font.has_weight_axis)))
}

/// The glyph `codepoint` maps to in `font`, or 0 when the font lacks it.
#[no_mangle]
pub extern "C" fn lut_font_glyph(font: u32, codepoint: u32) -> u32 {
    STATE.with_borrow(|state| {
        state
            .font(font)
            .and_then(|font| font.font_ref().charmap().map(codepoint))
            .map_or(0, |glyph| glyph.to_u32())
    })
}

/// Rasterizes `glyph` of `font` at `size` pixels per em and weight `weight` (on a weight axis; a
/// static font ignores it). Returns 1 with the mask in the result buffer, or 0 on failure.
#[no_mangle]
pub extern "C" fn lut_rasterize(font: u32, glyph: u32, size: f32, weight: f32, flags: u32) -> u32 {
    STATE.with_borrow_mut(|state| {
        u32::from(state.rasterize(font, glyph, size, weight, flags).is_some())
    })
}

/// The result header: `[width, height, left, top]` as 4 little-endian `i32`s.
#[no_mangle]
pub extern "C" fn lut_result_header() -> *const i32 {
    STATE.with_borrow(|state| state.header.as_ptr())
}

/// The result's `width * height` coverage bytes, row by row.
#[no_mangle]
pub extern "C" fn lut_result_pixels() -> *const u8 {
    STATE.with_borrow(|state| state.pixels.as_ptr())
}

impl LoadedFont {
    fn new(data: Box<[u8]>, index: u32) -> Option<Self> {
        let font = FontRef::from_index(&data, index).ok()?;
        font.outline_glyphs().format()?;
        let has_instructions = font.fpgm().is_ok_and(|fpgm| !fpgm.is_empty());
        let has_weight_axis = font.axes().iter().any(|axis| axis.tag() == WGHT);
        Some(Self {
            data,
            index,
            has_instructions,
            has_weight_axis,
            hinting: HashMap::new(),
        })
    }

    fn font_ref(&self) -> FontRef<'_> {
        FontRef::from_index(&self.data, self.index).expect("validated when loaded")
    }

    fn location(&self, weight: f32) -> Location {
        let font = self.font_ref();
        if self.has_weight_axis && weight > 0.0 {
            font.axes().location([(WGHT, weight)])
        } else {
            Location::default()
        }
    }
}

impl State {
    fn font(&self, font: u32) -> Option<&LoadedFont> {
        self.fonts.get((font as usize).wrapping_sub(1))?.as_ref()
    }

    fn rasterize(
        &mut self,
        font: u32,
        glyph: u32,
        size: f32,
        weight: f32,
        flags: u32,
    ) -> Option<()> {
        if !(size > 0.0 && size < 1024.0) {
            return None;
        }
        let loaded = self
            .fonts
            .get_mut((font as usize).wrapping_sub(1))?
            .as_mut()?;
        let location = loaded.location(weight);
        let font_ref = FontRef::from_index(&loaded.data, loaded.index).ok()?;
        let outlines = font_ref.outline_glyphs();
        let outline = outlines.get(GlyphId::new(glyph))?;
        let size = Size::new(size);
        let hinting = if flags & FLAG_HINT != 0 {
            let key = (size.ppem()?.to_bits(), weight.to_bits());
            if !loaded.hinting.contains_key(&key) {
                let engine = if loaded.has_instructions {
                    Engine::Interpreter
                } else {
                    Engine::Auto(None)
                };
                let target = Target::Smooth {
                    mode: SmoothMode::Normal,
                    symmetric_rendering: true,
                    preserve_linear_metrics: false,
                };
                let instance = HintingInstance::new(
                    &outlines,
                    size,
                    LocationRef::from(&location),
                    HintingOptions { engine, target },
                )
                .ok()?;
                loaded.hinting.insert(key, instance);
            }
            loaded.hinting.get(&key)
        } else {
            None
        };
        let settings = match hinting {
            Some(instance) => DrawSettings::from(instance),
            None => DrawSettings::unhinted(size, LocationRef::from(&location)),
        };

        self.path.clear();
        let slant = if flags & FLAG_OBLIQUE != 0 {
            OBLIQUE_SLANT
        } else {
            0.0
        };
        outline
            .draw(
                settings,
                &mut Pen {
                    path: &mut self.path,
                    slant,
                },
            )
            .ok()?;

        let embolden = if flags & FLAG_EMBOLDEN != 0 {
            (size.ppem()? * EMBOLDEN_PER_PX).max(0.5)
        } else {
            0.0
        };
        fill(&self.path, embolden, &mut self.pixels, &mut self.header);
        Some(())
    }
}

/// Fills `path` into `pixels`, thickened by `embolden` pixels when it is above 0, and records the
/// mask's placement in `header`.
fn fill(path: &[Command], embolden: f32, pixels: &mut Vec<u8>, header: &mut [i32; 4]) {
    if embolden <= 0.0 {
        let (mask, placement) = Mask::new(path).format(Format::Alpha).render();
        *pixels = mask;
        *header = [
            placement.width as i32,
            placement.height as i32,
            placement.left,
            placement.top,
        ];
        return;
    }
    // A stroke as wide as the extra weight grows every stem by half of it on each side; the fill
    // keeps the counters' interiors, which a stroke alone would leave hollow.
    let (mut mask, placement) = Mask::new(path)
        .style(Stroke::new(embolden))
        .format(Format::Alpha)
        .render();
    let mut inside = vec![0; mask.len()];
    Mask::new(path)
        .format(Format::Alpha)
        .size(placement.width, placement.height)
        .offset(Vector::new(-placement.left as f32, -placement.top as f32))
        .render_into(&mut inside, None);
    for (out, fill) in mask.iter_mut().zip(inside) {
        *out = (*out).max(fill);
    }
    *pixels = mask;
    *header = [
        placement.width as i32,
        placement.height as i32,
        placement.left,
        placement.top,
    ];
}

/// Collects a glyph outline in pixel space with y growing downwards, slanted by `slant`.
struct Pen<'a> {
    path: &'a mut Vec<Command>,
    slant: f32,
}

impl Pen<'_> {
    fn point(&self, x: f32, y: f32) -> [f32; 2] {
        [x + y * self.slant, -y]
    }
}

impl OutlinePen for Pen<'_> {
    fn move_to(&mut self, x: f32, y: f32) {
        let point = self.point(x, y);
        self.path.move_to(point);
    }

    fn line_to(&mut self, x: f32, y: f32) {
        let point = self.point(x, y);
        self.path.line_to(point);
    }

    fn quad_to(&mut self, cx0: f32, cy0: f32, x: f32, y: f32) {
        let (control, point) = (self.point(cx0, cy0), self.point(x, y));
        self.path.quad_to(control, point);
    }

    fn curve_to(&mut self, cx0: f32, cy0: f32, cx1: f32, cy1: f32, x: f32, y: f32) {
        let (first, second, point) = (self.point(cx0, cy0), self.point(cx1, cy1), self.point(x, y));
        self.path.curve_to(first, second, point);
    }

    fn close(&mut self) {
        self.path.close();
    }
}

#[cfg(test)]
mod tests;
