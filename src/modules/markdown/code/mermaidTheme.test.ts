import { describe, expect, it } from 'vitest';
import { mermaidThemeVariables, toHexColor } from './mermaidTheme';

describe('mermaidThemeVariables', () => {
  const token = (name: string) => `#${name}`;

  it('paints the diagram with the app tokens', () => {
    const vars = mermaidThemeVariables(token, true, 'Segoe UI');

    expect(vars).toMatchObject({
      darkMode: true,
      fontFamily: 'Segoe UI',
      background: '#background',
      primaryColor: '#secondary',
      primaryTextColor: '#foreground',
      lineColor: '#muted-foreground',
      noteBkgColor: '#popover',
    });
  });

  it('draws flat nodes, without the neo look glow', () => {
    expect(mermaidThemeVariables(token, true, 'x')).toMatchObject({
      dropShadow: 'none',
      useGradient: false,
    });
  });

  it('tells mermaid the mode', () => {
    expect(mermaidThemeVariables(token, false, 'x').darkMode).toBe(false);
  });
});

describe('toHexColor', () => {
  it('keeps a hex colour as written', () => {
    expect(toHexColor('#b8e65a')).toBe('#b8e65a');
    expect(toHexColor('#fff')).toBe('#fff');
  });
});
