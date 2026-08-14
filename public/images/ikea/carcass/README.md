# IKEA carcass swatches

Photos of the IKEA frame finishes, used only to paint a customer's own cabinet
in the website planner so their plan looks like their kitchen.

**Nothing in here is one of our products.** These are not in the colour library,
they are never priced, and they never appear on a quote. See
`lib/pcd-ikea-carcass.js`.

## What is in here

| File                     | Finish            | Offered on          |
| ------------------------ | ----------------- | ------------------- |
| `white.png`              | White             | Metod, Pax, Besta   |
| `dark_grey.png`          | Dark grey         | Pax, Besta          |
| `grey_beige.png`         | Grey beige        | Pax only            |
| `white_stained_oak.png`  | White stained oak | Pax, Besta          |

Metod is white and nothing else, so its picker shows a single swatch and says
why. Pax comes in all four.

## Adding or changing a finish

Two steps, and they have to happen together:

1. Save the image here.
2. Add it to `IKEA_CARCASS_FINISHES` in `lib/pcd-ikea-carcass.js` with its
   name, a fallback hex, the exact filename, and which `ranges` sell it.

**Both, or neither.** The 3D view loads these as textures, so a finish named in
the list without its file leaves that surface waiting on an image that never
arrives. The cabinet breaks rather than just looking plain.

Nothing else needs touching. The picker, the swatch in the side panel, the plan
and the 3D all read that one list.

Roughly square, about 600 x 600, cropped tight enough to show the grain or
texture rather than a whole door.
