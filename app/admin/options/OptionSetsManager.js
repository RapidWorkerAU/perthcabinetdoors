"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import styles from "../admin-content.module.css";

const KIND_OPTIONS = [
  { value: "finish", label: "Finish list" },
  { value: "colour_map", label: "Colours by finish" },
  { value: "profile_type", label: "Profile type list" },
  { value: "profile_map", label: "Profiles by type" },
  { value: "edge_mould", label: "Edge mould list" },
  { value: "hinge", label: "Hinge list" },
];

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function emptyDraft() {
  return {
    id: null,
    name: "",
    code: "",
    kind: "finish",
    configText: "",
    is_active: true,
  };
}

function formatConfig(kind, configJson) {
  if (kind === "hinge") {
    return (configJson?.items || [])
      .map((item) => `${item.label || ""} | ${item.price ?? 0}`)
      .join("\n");
  }

  if (kind === "colour_map" || kind === "profile_map") {
    return Object.entries(configJson?.map || {})
      .map(([key, values]) => `${key}: ${(values || []).join(", ")}`)
      .join("\n");
  }

  return (configJson?.items || []).join("\n");
}

function parseConfig(kind, configText) {
  const lines = configText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (kind === "hinge") {
    return {
      items: lines.map((line) => {
        const [labelPart, pricePart] = line.split("|");
        return {
          label: (labelPart || "").trim(),
          price: Number((pricePart || "0").trim()),
        };
      }),
    };
  }

  if (kind === "colour_map" || kind === "profile_map") {
    const map = {};
    lines.forEach((line) => {
      const [keyPart, valuePart] = line.split(":");
      const key = (keyPart || "").trim();
      if (!key) return;
      map[key] = (valuePart || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    });
    return { map };
  }

  return { items: lines };
}

function helperText(kind) {
  switch (kind) {
    case "colour_map":
      return "One finish per line. Example: Woodmatt: District Oak, Notaio Walnut";
    case "profile_map":
      return "One profile type per line. Example: Minimal: Oslo, Capri";
    case "hinge":
      return "One hinge per line. Example: Blum 110 Full Cover | 9.05";
    default:
      return "One option per line.";
  }
}

export default function OptionSetsManager({ initialOptionSets }) {
  const [optionSets, setOptionSets] = useState(initialOptionSets || []);
  const [draft, setDraft] = useState(emptyDraft());
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const grouped = useMemo(
    () =>
      KIND_OPTIONS.map((kind) => ({
        ...kind,
        items: optionSets.filter((item) => item.kind === kind.value),
      })),
    [optionSets]
  );

  function startNew(kind = "finish") {
    setDraft({ ...emptyDraft(), kind });
    setFeedback("");
  }

  function editItem(item) {
    setDraft({
      id: item.id,
      name: item.name || "",
      code: item.code || "",
      kind: item.kind || "finish",
      configText: formatConfig(item.kind, item.config_json || {}),
      is_active: item.is_active ?? true,
    });
    setFeedback("");
  }

  async function saveItem(event) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback("");

    try {
      const supabase = createSupabaseBrowserClient();
      const payload = {
        name: draft.name.trim(),
        code: draft.code.trim() || slugify(draft.name),
        kind: draft.kind,
        is_active: draft.is_active,
        config_json: parseConfig(draft.kind, draft.configText),
      };

      if (!payload.name || !payload.code) {
        setFeedback("Name and code are required.");
        return;
      }

      if (draft.id) {
        const { data, error } = await supabase
          .from("quote_option_sets")
          .update(payload)
          .eq("id", draft.id)
          .select("*")
          .single();

        if (error) {
          setFeedback(error.message || "Could not update option set.");
          return;
        }

        setOptionSets((previous) => previous.map((item) => (item.id === data.id ? data : item)));
      } else {
        const { data, error } = await supabase
          .from("quote_option_sets")
          .insert(payload)
          .select("*")
          .single();

        if (error) {
          setFeedback(error.message || "Could not create option set.");
          return;
        }

        setOptionSets((previous) => [...previous, data]);
        setDraft((current) => ({ ...current, id: data.id }));
      }

      setFeedback("Option set saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteItem() {
    if (!draft.id) return;
    setIsDeleting(true);
    setFeedback("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("quote_option_sets").delete().eq("id", draft.id);
      if (error) {
        setFeedback(error.message || "Could not delete option set.");
        return;
      }

      setOptionSets((previous) => previous.filter((item) => item.id !== draft.id));
      setDraft(emptyDraft());
      setFeedback("Option set deleted.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={styles.settingsGridWide}>
      <section className={styles.settingsCard}>
        <div className={styles.sectionHeaderRow}>
          <div>
            <p className={styles.sectionText}>
              Create reusable finish, colour, profile, edge, and hinge sets for quote-enabled products.
            </p>
          </div>
          <button type="button" className={styles.primaryButton} onClick={() => startNew()}>
            New option set
          </button>
        </div>

        <div className={styles.libraryGroups}>
          {grouped.map((group) => (
            <div key={group.value} className={styles.libraryGroup}>
              <div className={styles.libraryGroupHeader}>
                <h2 className={styles.libraryGroupTitle}>{group.label}</h2>
                <button type="button" className={styles.secondaryButton} onClick={() => startNew(group.value)}>
                  Add
                </button>
              </div>
              <div className={styles.libraryList}>
                {group.items.length ? (
                  group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.libraryListItem} ${draft.id === item.id ? styles.libraryListItemActive : ""}`}
                      onClick={() => editItem(item)}
                    >
                      <span>{item.name}</span>
                      <small>{item.code}</small>
                    </button>
                  ))
                ) : (
                  <p className={styles.placeholderText}>No sets yet.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.settingsCard}>
        <h2 className={styles.sectionTitle}>{draft.id ? "Edit option set" : "New option set"}</h2>
        <p className={styles.sectionText}>{helperText(draft.kind)}</p>

        <form className={styles.formStack} onSubmit={saveItem}>
          <label className={styles.fieldLabel} htmlFor="optionSetName">
            Name
          </label>
          <input
            id="optionSetName"
            className={styles.fieldInput}
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />

          <label className={styles.fieldLabel} htmlFor="optionSetCode">
            Code
          </label>
          <input
            id="optionSetCode"
            className={styles.fieldInput}
            value={draft.code}
            onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
            placeholder="auto-generated-if-empty"
          />

          <label className={styles.fieldLabel} htmlFor="optionSetKind">
            Type
          </label>
          <select
            id="optionSetKind"
            className={styles.fieldInput}
            value={draft.kind}
            onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
            />
            Active
          </label>

          <label className={styles.fieldLabel} htmlFor="optionSetConfig">
            Entries
          </label>
          <textarea
            id="optionSetConfig"
            className={styles.textareaInput}
            rows={14}
            value={draft.configText}
            onChange={(event) => setDraft((current) => ({ ...current, configText: event.target.value }))}
          />

          <div className={styles.inlineButtonRow}>
            <button type="submit" className={styles.primaryButton} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save option set"}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => setDraft(emptyDraft())}>
              Clear
            </button>
            {draft.id ? (
              <button type="button" className={styles.rowDeleteButton} onClick={deleteItem} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            ) : null}
          </div>
        </form>

        {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
      </section>
    </div>
  );
}

