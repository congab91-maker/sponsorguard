# SponsorGuard Design System

```yaml
tokens:
  colors:
    background: "hsl(210, 15%, 98%)"       # Off-white, professional background
    surface: "hsl(0, 0%, 100%)"            # White cards/containers
    text:
      primary: "hsl(220, 20%, 15%)"        # High-contrast charcoal text
      secondary: "hsl(220, 10%, 45%)"      # Slate gray metadata
      muted: "hsl(220, 10%, 65%)"          # Light gray placeholder / border
    border: "hsl(220, 15%, 90%)"           # Clean divider borders
    brand:
      primary: "hsl(220, 60%, 35%)"        # Restrained navy blue compliance primary
      accent: "hsl(200, 70%, 45%)"         # Light blue focus / interaction indicator
    status:
      compliant: "hsl(140, 50%, 30%)"      # Deep forest green (Low risk)
      warning: "hsl(40, 75%, 35%)"         # Dark ochre/yellow (Moderate risk)
      violation: "hsl(0, 65%, 40%)"        # Brick red (High risk)
  typography:
    family: "Outfit, Inter, sans-serif"
    scale:
      h1: "24px"
      h2: "18px"
      body: "14px"
      caption: "12px"
  rounded:
    sm: "4px"
    md: "6px"
  spacing:
    xs: "4px"
    sm: "8px"
    md: "16px"
    lg: "24px"
    xl: "32px"
```

## Prose & Design Rationale

SponsorGuard is a professional audit and escrow tool, not a consumer crypto game. Its design is restrained, flat, and structured.

### Constraints & Anti-patterns
- **No Gradients or Glows**: All buttons, cards, and headings must use flat, solid fills.
- **No Crypto Clutter**: Avoid tokens, rocketships, and standard web3 generic dashboards.
- **No Emoji as Structural Icons**: Use clean Lucide SVG icons instead of emojis for state representation.
- **Minimal Pills**: Do not clutter the layout with colored capsules; use neat labels.

### Accessibility Rules
- **Keyboard focus**: Every button and form input must show a clear, high-contrast `:focus-visible` outline using the accent color.
- **Form inputs**: All input tags must have explicit `<label>` tags with matching `htmlFor` properties.
- **Aria Live**: Dynamic status overlays (consensus pending, signature rejected) must announce themselves using `aria-live="polite"`.
- **Reduced Motion**: Under `prefers-reduced-motion: reduce`, animations are skipped, and immediate state updates are rendered.
