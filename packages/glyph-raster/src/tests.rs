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

/// Sum of one channel (0 red, 1 green, 2 blue) of an RGBA mask.
fn channel_ink(pixels: &[u8], channel: usize) -> u32 {
    pixels
        .iter()
        .skip(channel)
        .step_by(4)
        .map(|&v| u32::from(v))
        .sum()
}

#[test]
fn subpixel_masks_hold_one_coverage_per_channel() {
    let font = load();
    let (width, height, left, top, pixels) =
        raster(font, 'L', 14.0, 400.0, FLAG_HINT | FLAG_SUBPIXEL);
    assert_eq!(pixels.len(), width * height * 4);
    let gray = raster(font, 'L', 14.0, 400.0, FLAG_HINT);
    assert_eq!(top, gray.3, "the same rows");
    assert!(
        left <= gray.2,
        "the filter reaches left of the ink: {left} vs {}",
        gray.2
    );
    for pixel in pixels.as_chunks::<4>().0 {
        assert_eq!(pixel[3], pixel[0].max(pixel[1]).max(pixel[2]));
    }
    let row = height / 2;
    let fringed = (0..width).any(|column| {
        let at = (row * width + column) * 4;
        pixels[at] != pixels[at + 2]
    });
    assert!(fringed, "a stem's edges differ between red and blue");
}

#[test]
fn every_channel_carries_the_ink_of_the_grayscale_mask() {
    let font = load();
    for codepoint in ['l', 'M', 'o'] {
        let gray = raster(font, codepoint, 20.0, 400.0, 0).4;
        let gray: u32 = gray.iter().map(|&v| u32::from(v)).sum();
        let lcd = raster(font, codepoint, 20.0, 400.0, FLAG_SUBPIXEL).4;
        for channel in 0..3 {
            let ink = channel_ink(&lcd, channel);
            let ratio = ink as f64 / gray as f64;
            assert!(
                (0.95..1.05).contains(&ratio),
                "{codepoint:?} channel {channel}: {ink} vs {gray}"
            );
        }
    }
}

#[test]
fn bgr_swaps_red_and_blue() {
    let font = load();
    let rgb = raster(font, 'M', 14.0, 400.0, FLAG_HINT | FLAG_SUBPIXEL);
    let bgr = raster(font, 'M', 14.0, 400.0, FLAG_HINT | FLAG_SUBPIXEL | FLAG_BGR);
    assert_eq!((rgb.0, rgb.1, rgb.2, rgb.3), (bgr.0, bgr.1, bgr.2, bgr.3));
    for (a, b) in rgb
        .4
        .as_chunks::<4>()
        .0
        .iter()
        .zip(bgr.4.as_chunks::<4>().0)
    {
        assert_eq!(*a, [b[2], b[1], b[0], b[3]]);
    }
}

#[test]
fn subpixel_masks_synthesize_bold_too() {
    let font = load();
    let regular = raster(font, 'l', 28.0, 400.0, FLAG_HINT | FLAG_SUBPIXEL);
    let bold = raster(
        font,
        'l',
        28.0,
        400.0,
        FLAG_HINT | FLAG_SUBPIXEL | FLAG_EMBOLDEN,
    );
    assert!(channel_ink(&bold.4, 1) > channel_ink(&regular.4, 1));
    assert_eq!(bold.4.len(), bold.0 * bold.1 * 4);
}

#[test]
fn a_blank_glyph_gives_an_empty_subpixel_mask() {
    let font = load();
    let (width, height, _, _, pixels) = raster(font, ' ', 14.0, 400.0, FLAG_HINT | FLAG_SUBPIXEL);
    assert_eq!(width * height, 0);
    assert!(pixels.is_empty());
}
