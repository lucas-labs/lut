# Nerd Font Icons

Two private-use icon faces back every terminal font. They are not lut's work: both
are subsets of the Nerd Fonts glyphs in Ghostty's `JetBrainsMonoNerdFont-Regular.ttf`
(Powerline, Devicons, Seti, Codicons, Font Awesome, Font Logos, Octicons, Weather and
Material Design icons), renamed only so they never shadow an installed font. Text and
color emoji keep using the selected text font and the platform fallback.

| Face | File | Codepoints | Glyphs | Size |
| --- | --- | --- | --- | --- |
| Nerd Font Icons | `nerd-font-icons.woff2` | U+E000-F8FF | 3,175 | 365,256 B |
| Nerd Font Icons MDI | `nerd-font-icons-mdi.woff2` | U+F0000-FFFFD | 6,896 | 348,832 B |

The first face loads with the first terminal. The MDI face (about 350 kB) loads
only when a glyph in U+F0000-FFFFD is first drawn, and the terminal rebuilds its
glyph atlas when it arrives. Neither is part of the startup graph: the
`@font-face` rules in `src/styles/fonts.css` fetch a file only on use.

Source: Ghostty revision `349f026087d948f8f898dca3231ff91438f83ab8`,
`src/font/res/JetBrainsMonoNerdFont-Regular.ttf` (SHA-256
`a2f4268a1719b95d1f1448376173a42317919cb598423f18ea327eaca13dd916`).

Derivation (FontTools 4.60, Brotli 1.1; no font tooling is a build or runtime
dependency): keep the codepoint ranges above, drop hinting, layout tables and
glyph names, rescale 1000 to 500 units per em (a point moves by at most 0.001 em),
and rename the family to the names above. Advance widths stay one cell: 0.6 em, the
cell of JetBrains Mono and of Source Code Pro, the bundled text font. One face serves
regular, bold and italic; the webview synthesizes styles. The rasterizer fits each icon to the terminal's cell
(`gpu/GlyphPlacement.ts`).

- `nerd-font-icons.woff2` SHA-256:
  `3244bd1ec660d04f9d53deca1b8b1ca676a752faa58834c54a8fd2c61d3a6c9a`
- `nerd-font-icons-mdi.woff2` SHA-256:
  `626d78179d2afe26655f480de4f85624f5049a92473b36d57b636aa680e282b7`

The SIL Open Font License and Nerd Fonts notices accompany the source here and
ship in `public/licenses/nerd-font-icons.txt`. Original copyright metadata is
retained in both fonts.
