use super::*;

const FONT: &[u8] = include_bytes!("../../../src/assets/fonts/source-code-pro-latin.ttf");

fn load() -> u32 {
    let pointer = lut_alloc(FONT.len());
    unsafe {
        std::ptr::copy_nonoverlapping(FONT.as_ptr(), pointer, FONT.len());
        lut_font_load(pointer, FONT.len(), 0)
    }
}

/// The result as `(width, height, left, top, pixels)`.
fn result() -> (usize, usize, i32, i32, Vec<u8>) {
    STATE.with_borrow(|state| {
        let [width, height, left, top] = state.header;
        (
            width as usize,
            height as usize,
            left,
            top,
            state.pixels.clone(),
        )
    })
}

fn raster(
    font: u32,
    codepoint: char,
    size: f32,
    weight: f32,
    flags: u32,
) -> (usize, usize, i32, i32, Vec<u8>) {
    let glyph = lut_font_glyph(font, codepoint as u32);
    assert_ne!(glyph, 0, "{codepoint:?} is in the font");
    assert_eq!(lut_rasterize(font, glyph, size, weight, flags), 1);
    result()
}

/// Coverage of each column of the mask's middle row.
fn middle_row(width: usize, height: usize, pixels: &[u8]) -> Vec<u8> {
    let row = height / 2;
    pixels[row * width..(row + 1) * width].to_vec()
}

#[test]
fn rejects_bytes_that_are_not_a_font() {
    let pointer = lut_alloc(4);
    unsafe {
        std::ptr::copy_nonoverlapping(b"nope".as_ptr(), pointer, 4);
        assert_eq!(lut_font_load(pointer, 4, 0), 0);
    }
}

#[test]
fn reports_the_weight_axis_and_refuses_a_missing_face() {
    let font = load();
    assert_eq!(lut_font_has_weight_axis(font), 1);
    assert_eq!(lut_font_has_weight_axis(font + 100), 0);
    let pointer = lut_alloc(FONT.len());
    unsafe {
        std::ptr::copy_nonoverlapping(FONT.as_ptr(), pointer, FONT.len());
        assert_eq!(
            lut_font_load(pointer, FONT.len(), 1),
            0,
            "a single font has no face 1"
        );
    }
}

#[test]
fn maps_code_points_and_reports_missing_ones() {
    let font = load();
    assert_ne!(lut_font_glyph(font, 'L' as u32), 0);
    assert_eq!(
        lut_font_glyph(font, 0x4E2D),
        0,
        "no CJK in the latin subset"
    );
    assert_eq!(lut_font_glyph(font + 100, 'L' as u32), 0, "unknown handle");
    lut_font_drop(font);
    assert_eq!(lut_font_glyph(font, 'L' as u32), 0, "dropped handle");
}

#[test]
fn hinting_puts_the_stem_of_l_on_whole_pixels() {
    let font = load();
    let (width, height, _, _, pixels) = raster(font, 'l', 14.0, 400.0, FLAG_HINT);
    let row = middle_row(width, height, &pixels);
    let full = row.iter().filter(|&&value| value >= 230).count();
    let partial = row
        .iter()
        .filter(|&&value| value > 25 && value < 230)
        .count();
    assert!(full >= 1, "a solid stem column: {row:?}");
    assert!(partial <= 1, "at most one soft edge: {row:?}");
}

#[test]
fn unhinted_stems_spread_over_soft_pixels() {
    let font = load();
    let (width, height, _, _, pixels) = raster(font, 'l', 14.0, 400.0, 0);
    let row = middle_row(width, height, &pixels);
    assert!(
        row.iter().any(|&value| value > 25 && value < 230),
        "an unhinted stem keeps grey edges: {row:?}"
    );
}

#[test]
fn places_the_mask_from_the_pen_at_the_baseline() {
    let font = load();
    let (width, height, left, top, pixels) = raster(font, 'L', 14.0, 400.0, FLAG_HINT);
    assert_eq!(pixels.len(), width * height);
    assert!(top < 0, "a capital rises above the baseline: {top}");
    assert!(top + height as i32 <= 1, "and does not descend below it");
    assert!((0..4).contains(&left), "small left bearing: {left}");
}

#[test]
fn the_weight_axis_thickens_the_stems() {
    let font = load();
    let ink = |weight| {
        raster(font, 'l', 28.0, weight, FLAG_HINT)
            .4
            .iter()
            .map(|&v| u32::from(v))
            .sum::<u32>()
    };
    assert!(ink(700.0) > ink(400.0) * 5 / 4);
}

#[test]
fn embolden_and_oblique_synthesize_styles() {
    let font = load();
    let regular = raster(font, 'l', 28.0, 400.0, FLAG_HINT);
    let bold = raster(font, 'l', 28.0, 400.0, FLAG_HINT | FLAG_EMBOLDEN);
    let ink = |pixels: &[u8]| pixels.iter().map(|&v| u32::from(v)).sum::<u32>();
    assert!(ink(&bold.4) > ink(&regular.4), "emboldened ink");
    assert!(bold.0 > regular.0, "emboldened width");
    let upright = raster(font, '|', 28.0, 400.0, FLAG_HINT);
    let oblique = raster(font, '|', 28.0, 400.0, FLAG_HINT | FLAG_OBLIQUE);
    assert!(
        oblique.0 > upright.0 + 3,
        "a slanted bar is wider than an upright one"
    );
}

#[test]
fn refuses_sizes_outside_the_atlas() {
    let font = load();
    let glyph = lut_font_glyph(font, 'L' as u32);
    assert_eq!(lut_rasterize(font, glyph, 0.0, 400.0, FLAG_HINT), 0);
    assert_eq!(lut_rasterize(font, glyph, f32::NAN, 400.0, FLAG_HINT), 0);
    assert_eq!(lut_rasterize(font, glyph, 4096.0, 400.0, FLAG_HINT), 0);
}
