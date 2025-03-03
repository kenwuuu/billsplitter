Hosted at: https://kenwuuu.github.io/billsplitter/

# Setup
## Style Libraries
### 1. [Install Tailwind CSS](https://tailwindcss.com/docs/installation)
1. Install Tailwind CSS
```bash
npm install tailwindcss @tailwindcss/cli
```
2. Import Tailwind in your CSS file
```css
@import "tailwindcss" source(none);
```

### 2. [Install daisyUI](https://daisyui.com/docs/install/cli/) (for vanilla HTML/JS)
1. Install Tailwind CSS. See above.
2. Install daisyUI as a Node package.
```bash
npm i -D daisyui@latest
```
3. Add daisyUI to your CSS file
```css
@import "tailwindcss" source(none);
@source "./src/*.{html,js}";  /* point this at your source code folder */
@plugin "daisyui";
```
4. Add a build script to npm
```json
{
  "scripts": {
    "build:css": "npx @tailwindcss/cli -i app.css -o public/output.css"
  },
}
```
5. Build
```bash
npm run build:css
```
6. Then link the output CSS in your HTML files
```html
<link href="./output.css" rel="stylesheet">
```
### 3. [Add Tailwind Typography](https://github.com/tailwindlabs/tailwindcss-typography/blob/main/README.md) to handle plain HTML text
Like header and paragraph tags
1. Install plugin from npm
```bash
npm install -D @tailwindcss/typography
```
2. Add the plugin to your main `style.css` file
```diff
  @import "tailwindcss";
+ @plugin "@tailwindcss/typography";
```
3. Then wrap the HTML you want styles applied to with `prose`
```html
<article class="prose lg:prose-xl">
  <h1>Garlic bread with cheese: What the science tells us</h1>
  <p>
    For years parents have espoused the health benefits of eating garlic bread with cheese to their
    children, with the food earning such an iconic status in our culture that kids will often dress
    up as warm, cheesy loaf for Halloween.
  </p>
  <p>
    But a recent study shows that the celebrated appetizer may be linked to a series of rabies cases
    springing up around the country.
  </p>
  <!-- ... -->
</article>
```

# Libraries
1. OCR: [tesseract](https://github.com/naptha/tesseract.js)
2. Document detection: [jscanify](https://github.com/puffinsoft/jscanify)
3. OCR but slightly optimized?: [WASM Tesseract](https://github.com/robertknight/tesseract-wasm?tab=readme-ov-file)

# Flow

Names are added to set, so no duplicates.

New items are appended.

New prices are updated from top-down, so will overwrite.