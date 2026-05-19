# Reprogrammer Font Files

## Inter Variable Font

**File:** `Inter-VariableFont.ttf` (7.0 MB)

A modern, open-source typeface optimized for screens. Supports all weights (100–900) and styles in a single variable font file.

### Why Inter?

- **Accessibility-first:** Designed with dyslexia and screen-reader compatibility in mind
- **Calm and professional:** Pairs perfectly with the neon-green mental-health theme
- **Performance:** Variable font = single file for all weights
- **Modern:** Contemporary geometric design without compromising readability

### Usage in App

Import the font configuration:
```typescript
import { FontFamily, FontWeights, FontSizes } from '@/constants/fonts';

const styles = StyleSheet.create({
  heading: {
    fontFamily: FontFamily.primary,
    fontSize: FontSizes['2xl'],
    fontWeight: FontWeights.bold,
  },
  body: {
    fontFamily: FontFamily.primary,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.normal,
  },
});
```

### Usage in Figma/Design Tools

1. **Download locally:** Copy `Inter-VariableFont.ttf` to your fonts folder
2. **Install on system:** Double-click to install (macOS) or use Font Manager (Windows/Linux)
3. **Use in Figma:** 
   - Restart Figma after installing the font
   - Select "Inter" from the font dropdown
   - Use font weight slider for all weights (300–700 recommended)
4. **Attach to Claude Design:**
   - Use "Inter" as the primary font for all text
   - Match font weights to code: 400 = normal, 600 = semibold, 700 = bold

### Font Weight Reference

| Weight | Name       | Use Case |
|--------|------------|----------|
| 400    | Regular    | Body text, default |
| 500    | Medium     | Secondary text, labels |
| 600    | SemiBold   | Subheadings, emphasis |
| 700    | Bold       | Headings, strong emphasis |

### License

Inter is freely available under the [Open Font License](https://scripts.sil.org/OFL).
