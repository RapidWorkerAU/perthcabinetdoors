import styles from "../../app/(site)/journey.module.css";

// A block of real colour tiles, used as the visual beside the finishes link on
// /bespoke and /kitchen-refresh. Not browsable and not labelled, the browsable
// library is /finishes. This exists to make the point that there are a lot of
// them, which a sentence cannot do.
export default function ColourStrip({ colours = [], count = 36 }) {
  if (!colours.length) return null;

  // Sample across the whole library rather than taking the first N, which would
  // all come from one finish range and read as though we only sell oak.
  const step = Math.max(1, Math.floor(colours.length / count));
  const picks = [];
  for (let i = 0; i < colours.length && picks.length < count; i += step) picks.push(colours[i]);

  return (
    <div className={styles.colourStrip} aria-hidden="true">
      {picks.map((colour) => (
        <span
          key={`${colour.finish}-${colour.name}`}
          title={colour.name}
          style={
            colour.imageUrl
              ? { backgroundImage: `url(${colour.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: colour.swatch || "#dbd8cc" }
          }
        />
      ))}
    </div>
  );
}
