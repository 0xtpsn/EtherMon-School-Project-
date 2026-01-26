# Söhne Font Files

This directory should contain your Söhne font files.

## Required Files

Place the following font files in this directory:

- `soehne-buch.woff2` (or `.woff`) - Regular weight (400)
- `soehne-kraftig.woff2` (or `.woff`) - Medium weight (500)  
- `soehne-halbfett.woff2` (or `.woff`) - Semi-bold weight (600)
- `soehne-dreiviertelfett.woff2` (or `.woff`) - Bold weight (700)

## If Your Files Have Different Names

If your Söhne font files have different names, you'll need to update the `@font-face` declarations in `src/index.css` to match your actual file names.

## Where to Get Söhne

Söhne is a commercial font from Klim Type Foundry. You can purchase it from:
- https://klim.co.nz/retail-fonts/soehne/

Make sure you have a web font license that allows you to use it on your website.

## Testing

After adding the font files:
1. Restart your development server (`npm run dev`)
2. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
3. Check the browser console (F12) for any 404 errors related to font files
4. Inspect an element and check the Computed styles to see if 'Söhne' is being used

