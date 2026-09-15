-- TWO MORE VOCABULARIES: BOARD FINISHES AND HARDWARE BRANDS.
--
-- ── WHY THESE TWO ────────────────────────────────────────────────────────────
--
-- Both were plain text boxes, and a text box is how one answer becomes several.
-- The live board library grew three finishes twice over, purely from typing:
--
--     "Absolute Grain"  x3   and   "AbsoluteGrain"  x1
--     "Absolute Matt"   x1   and   "AbsoluteMatte"  x1
--     "Raw"             x3   and   "Raw Finish"     x1
--
-- Nothing rejected them, because nothing could: to the database they are six
-- different words. Every screen that groups or filters by finish then read six
-- finishes, so the public /finishes page listed one of them twice and a quote
-- could be written against either spelling.
--
-- The hardware brand column had the same shape and the same risk. It also holds
-- one row whose "brand" is "Strip Light", which is what the thing is rather
-- than who makes it, so that one is deliberately NOT seeded: whoever edits that
-- row next is offered the real brands instead of having the mistake blessed as
-- an option for everybody.
--
-- ── WHAT THIS SEEDS ──────────────────────────────────────────────────────────
--
-- Exactly what the two libraries already hold, minus the duplicate spellings.
-- The finishes are read across all brands rather than held per brand: a finish
-- belongs to a brand in the real world, but filing them apart here would mean a
-- customer's Matt could not be found because it was under Polytec while the
-- board was Laminex. The brand is already on the colour.
--
-- ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────
--
-- IT DOES NOT MERGE THE DUPLICATES ALREADY IN THE LIBRARY. The four rows
-- spelt the other way are left exactly as they are, and the colour library
-- keeps showing them, because a finish is referred to BY NAME on saved quote
-- lines and design items. Rewriting "AbsoluteGrain" to "Absolute Grain" here
-- would move the colour and leave every line that named the old spelling
-- pointing at a finish that no longer exists.
--
-- Fixing them is a separate, deliberate job: change the colour, then the lines
-- that refer to it, in one block, having first looked at how many there are.
-- This migration stops NEW ones being created, which is the half that can be
-- done safely without looking at anybody's history.
--
-- Safe to run twice. on conflict does nothing, the same as every other seed.

begin;

insert into public.pcd_list_items (list_key, item_key, label, sort_order, is_active, extras)
values
    -- Board finishes, as the library spells them today.
    ('colour_finishes', 'Absolute Grain', 'Absolute Grain',   0, true, '{}'),
    ('colour_finishes', 'Absolute Matt',  'Absolute Matt',   10, true, '{}'),
    ('colour_finishes', 'Ashgrain',       'Ashgrain',        20, true, '{}'),
    ('colour_finishes', 'Flint',          'Flint',           30, true, '{}'),
    ('colour_finishes', 'Gloss',          'Gloss',           40, true, '{}'),
    ('colour_finishes', 'Legato',         'Legato',          50, true, '{}'),
    ('colour_finishes', 'Matt',           'Matt',            60, true, '{}'),
    ('colour_finishes', 'Natura',         'Natura',          70, true, '{}'),
    ('colour_finishes', 'Natural',        'Natural',         80, true, '{}'),
    ('colour_finishes', 'Pearl',          'Pearl',           90, true, '{}'),
    ('colour_finishes', 'Ravine',         'Ravine',         100, true, '{}'),
    ('colour_finishes', 'Raw',            'Raw',            110, true, '{}'),
    ('colour_finishes', 'Satin',          'Satin',          120, true, '{}'),
    ('colour_finishes', 'Sheen',          'Sheen',          130, true, '{}'),
    ('colour_finishes', 'Silk',           'Silk',           140, true, '{}'),
    ('colour_finishes', 'Smooth',         'Smooth',         150, true, '{}'),
    ('colour_finishes', 'Tactile',        'Tactile',        160, true, '{}'),
    ('colour_finishes', 'Texture',        'Texture',        170, true, '{}'),
    ('colour_finishes', 'Ultramatt',      'Ultramatt',      180, true, '{}'),
    ('colour_finishes', 'Velvet',         'Velvet',         190, true, '{}'),
    ('colour_finishes', 'Venette',        'Venette',        200, true, '{}'),
    ('colour_finishes', 'Woodgrain',      'Woodgrain',      210, true, '{}'),
    ('colour_finishes', 'Woodmatt',       'Woodmatt',       220, true, '{}'),

    -- Hardware brands. "Strip Light" is not here on purpose: see the note above.
    ('hardware_brands', 'Blum',    'Blum',     0, true, '{}'),
    ('hardware_brands', 'Finista', 'Finista', 10, true, '{}'),
    ('hardware_brands', 'Hafele',  'Hafele',  20, true, '{}'),
    ('hardware_brands', 'Galvins', 'Galvins', 30, true, '{}')
on conflict (list_key, item_key) do nothing;

commit;

notify pgrst, 'reload schema';

-- ── NOTHING BELOW THIS LINE ──────────────────────────────────────────────────
--
-- This file is one runnable block and ends here. The check query for which
-- colours still carry a duplicate spelling is a separate read only query and is
-- not pasted here, because a select tacked onto the end of a migration gets run
-- as part of it and its result scrolls past with everything else.
