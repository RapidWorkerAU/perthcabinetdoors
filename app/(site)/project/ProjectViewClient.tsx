"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type ProjectPayload = {
  project: {
    id: string;
    quote_id: string;
    name: string | null;
    status: string | null;
    accepted_at: string | null;
    created_at: string | null;
  };
  deliverables: Array<{
    id: string;
    title: string | null;
    description: string | null;
    pricing_mode: string | null;
    planned_hours: number | null;
    unit_rate: number | null;
    budget_ex_gst: number | null;
    status: string | null;
  }>;
  milestones: Array<{
    id: string;
    project_deliverable_id: string;
    title: string | null;
    description: string | null;
    planned_hours: number | null;
    status: string | null;
    estimated_completion_date?: string | null;
  }>;
  time_entries: Array<{
    id: string;
    project_milestone_id: string;
    entry_date: string | null;
    hours: number;
    note: string | null;
    created_at: string | null;
  }>;
};

export default function ProjectViewClient({
  initialDate = null,
}: {
  initialDate?: string | null;
}) {
  const [payload, setPayload] = useState<ProjectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDeliverableId, setOpenDeliverableId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string>("");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>("");
  const [logPage, setLogPage] = useState(1);
  const [selectedDeliverableTileId, setSelectedDeliverableTileId] = useState<string | null>(null);
  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/project/get", { cache: "no-store" });
        if (!response.ok) {
          const message = await response.text();
          setError(message || "We could not load the project.");
          return;
        }
        const data = (await response.json()) as ProjectPayload;
        setPayload(data);
      } catch {
        setError("We could not load the project.");
      }
    };
    load();
  }, []);

  const milestonesByDeliverable = useMemo(() => {
    const map: Record<string, ProjectPayload["milestones"]> = {};
    if (!payload) return map;
    payload.milestones.forEach((item) => {
      if (!map[item.project_deliverable_id]) {
        map[item.project_deliverable_id] = [];
      }
      map[item.project_deliverable_id].push(item);
    });
    return map;
  }, [payload]);

  const milestoneHours = useMemo(() => {
    const map: Record<string, number> = {};
    if (!payload) return map;
    payload.time_entries.forEach((entry) => {
      map[entry.project_milestone_id] = (map[entry.project_milestone_id] ?? 0) + entry.hours;
    });
    return map;
  }, [payload]);

  const deliverableEstimatedDates = useMemo(() => {
    const map: Record<string, string | null> = {};
    if (!payload) return map;
    payload.milestones.forEach((milestone) => {
      const date = milestone.estimated_completion_date;
      if (!date) return;
      const current = map[milestone.project_deliverable_id];
      if (!current || date > current) {
        map[milestone.project_deliverable_id] = date;
      }
    });
    return map;
  }, [payload]);

  const milestoneById = useMemo(() => {
    const map: Record<string, ProjectPayload["milestones"][number]> = {};
    if (!payload) return map;
    payload.milestones.forEach((milestone) => {
      map[milestone.id] = milestone;
    });
    return map;
  }, [payload]);

  const deliverableById = useMemo(() => {
    const map: Record<string, ProjectPayload["deliverables"][number]> = {};
    if (!payload) return map;
    payload.deliverables.forEach((deliverable) => {
      map[deliverable.id] = deliverable;
    });
    return map;
  }, [payload]);

  const timeEntriesByDate = useMemo(() => {
    const map: Record<string, ProjectPayload["time_entries"]> = {};
    if (!payload) return map;
    payload.time_entries.forEach((entry) => {
      const dateKey = entry.entry_date ?? "";
      if (!dateKey) return;
      if (!map[dateKey]) {
        map[dateKey] = [];
      }
      map[dateKey].push(entry);
    });
    return map;
  }, [payload]);

  const getPerthTimezoneLabel = () => {
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Perth",
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "AWST";
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-AU");
  };

  if (error) {
    return (
      <div className="qb-panel">
        <div className="qb-panel-header">Project</div>
        <div className="qb-panel-body text-sm text-slate-700">{error}</div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="qb-panel">
        <div className="qb-panel-header">Project</div>
        <div className="qb-panel-body text-sm text-slate-700">Loading project...</div>
      </div>
    );
  }

  const projectPlanned = payload.deliverables.reduce(
    (sum, deliverable) => sum + (deliverable.planned_hours ?? 0),
    0
  );
  const projectLogged = payload.deliverables.reduce((sum, deliverable) => {
    const deliverableMilestones = milestonesByDeliverable[deliverable.id] ?? [];
    const deliverableLogged = deliverableMilestones.reduce(
      (mSum, milestone) => mSum + (milestoneHours[milestone.id] ?? 0),
      0
    );
    return sum + deliverableLogged;
  }, 0);
  const projectProgress =
    projectPlanned > 0 ? Math.min(100, Math.round((projectLogged / projectPlanned) * 100)) : 0;

  const latestLog = payload.time_entries.reduce<
    { createdAt: string; timestamp: number } | null
  >((latest, entry) => {
    if (!entry.created_at) return latest;
    const ts = new Date(entry.created_at).getTime();
    if (Number.isNaN(ts)) return latest;
    if (!latest || ts > latest.timestamp) {
      return { createdAt: entry.created_at, timestamp: ts };
    }
    return latest;
  }, null);

  const lastLogLabel = (() => {
    if (!latestLog) return "-";
    const now = Date.now();
    const diffMs = Math.max(0, now - latestLog.timestamp);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const dayLabel = diffDays === 1 ? "day" : "days";
    return `${new Date(latestLog.createdAt).toLocaleString("en-AU")} (${diffDays} ${dayLabel})`;
  })();

  const dateFilteredEntries = selectedDate
    ? timeEntriesByDate[selectedDate] ?? []
    : payload.time_entries;
  const deliverableFilteredEntries = selectedDeliverableId
    ? dateFilteredEntries.filter(
        (entry) =>
          milestoneById[entry.project_milestone_id]?.project_deliverable_id ===
          selectedDeliverableId
      )
    : dateFilteredEntries;
  const selectedEntries = selectedMilestoneId
    ? deliverableFilteredEntries.filter(
        (entry) => entry.project_milestone_id === selectedMilestoneId
      )
    : deliverableFilteredEntries;
  const selectedTotalHours = selectedEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const LOG_PAGE_SIZE = 10;
  const totalLogPages = Math.max(1, Math.ceil(selectedEntries.length / LOG_PAGE_SIZE));
  const pagedEntries = selectedEntries.slice(
    (logPage - 1) * LOG_PAGE_SIZE,
    logPage * LOG_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div className="qb-panel">
        <div className="qb-panel-header">Project Summary</div>
        <div className="qb-panel-body qb-grid">
          <div className="qb-field">
            <label>Project name</label>
            <div className="qb-input qb-input--static">
              {payload.project.name ?? "Project"}
            </div>
          </div>
          <div className="qb-field">
            <label>Status</label>
            <div className="qb-input qb-input--static">
              {(payload.project.status ?? "active").replace(/^./, (char) => char.toUpperCase())}
            </div>
          </div>
          <div className="qb-field">
            <label>Planned hours</label>
            <div className="qb-input qb-input--static">{projectPlanned}</div>
          </div>
          <div className="qb-field">
            <label>Hours used</label>
            <div className="qb-input qb-input--static">{projectLogged}</div>
          </div>
          <div className="qb-field">
            <label>Completion</label>
            <div className="qb-input qb-input--static">{projectProgress}%</div>
          </div>
          <div className="qb-field">
            <label>Last log update</label>
            <div className="qb-input qb-input--static">{lastLogLabel}</div>
          </div>
        </div>
      </div>

      <div className="qb-panel">
        <div className="qb-panel-header">Project Schedule</div>
        <div className="qb-panel-body">
          <table className="qb-table qb-table--nested qb-table--quote-view">
            <colgroup>
              <col style={{ width: "40px" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "18%" }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>Deliverable</th>
                <th>Description</th>
                <th className="text-center">Est. completion</th>
                <th className="text-center">Planned hrs</th>
                <th className="text-center">Hours used</th>
                <th className="text-center">Progress</th>
              </tr>
            </thead>
            <tbody>
              {payload.deliverables.map((deliverable) => {
                const milestones = milestonesByDeliverable[deliverable.id] ?? [];
                const deliverablePlanned = deliverable.planned_hours ?? 0;
                const deliverableLogged = milestones.reduce(
                  (sum, milestone) => sum + (milestoneHours[milestone.id] ?? 0),
                  0
                );
                const deliverableProgress =
                  deliverablePlanned > 0
                    ? Math.min(100, Math.round((deliverableLogged / deliverablePlanned) * 100))
                    : 0;
                const isOpen = openDeliverableId === deliverable.id;

                const isSelected = selectedDeliverableTileId === deliverable.id;

                return (
                  <Fragment key={deliverable.id}>
                    <tr
                      className={
                        isOpen
                          ? `qb-deliverable-row is-open${isSelected ? " is-selected" : ""}`
                          : `qb-deliverable-row${isSelected ? " is-selected" : ""}`
                      }
                      onClick={() =>
                        setSelectedDeliverableTileId((prev) =>
                          prev === deliverable.id ? null : deliverable.id
                        )
                      }
                    >
                      <td data-label="">
                        <button
                          type="button"
                          className="qb-toggle-btn"
                          onClick={() =>
                            setOpenDeliverableId((prev) =>
                              prev === deliverable.id ? null : deliverable.id
                            )
                          }
                          aria-expanded={isOpen}
                          aria-label="Toggle milestones"
                        >
                          {isOpen ? "–" : "+"}
                        </button>
                      </td>
                      <td data-label="Deliverable">
                        <div className="qb-input qb-input--static">
                          {deliverable.title ?? "Deliverable"}
                        </div>
                      </td>
                      <td data-label="Description">
                        <div className="qb-input qb-input--static">
                          {deliverable.description ?? "-"}
                        </div>
                      </td>
                      <td data-label="Est. completion" className="text-center">
                        <div className="qb-input qb-input--static">
                          {deliverableEstimatedDates[deliverable.id]
                            ? formatDate(deliverableEstimatedDates[deliverable.id])
                            : "TBC"}
                        </div>
                      </td>
                      <td data-label="Planned hrs" className="text-center">
                        <div className="qb-input qb-input--static">{deliverablePlanned}</div>
                      </td>
                      <td data-label="Hours used" className="text-center">
                        <div className="qb-input qb-input--static">{deliverableLogged}</div>
                      </td>
                      <td data-label="Progress" className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="w-10 text-right text-xs text-slate-500">
                            {deliverableProgress}%
                          </span>
                          <div className="relative h-3 w-28 rounded-full border border-slate-400 bg-white shadow-sm">
                            <div
                              className="absolute left-0 top-0 h-3 rounded-full bg-emerald-500"
                              style={{ width: `${deliverableProgress}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                    {isOpen && milestones.length > 0 && (
                      <tr className="qb-nested-block">
                        <td colSpan={7}>
                          <table className="qb-table qb-table--nested qb-table--milestones">
                            <colgroup>
                              <col style={{ width: "40px" }} />
                              <col style={{ width: "22%" }} />
                              <col style={{ width: "28%" }} />
                              <col style={{ width: "10%" }} />
                              <col style={{ width: "10%" }} />
                              <col style={{ width: "10%" }} />
                              <col style={{ width: "18%" }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th></th>
                                <th>Milestone</th>
                                <th>Description</th>
                                <th className="text-center">Est. completion</th>
                                <th className="text-center">Planned hrs</th>
                                <th className="text-center">Hours used</th>
                                <th className="text-center">Progress</th>
                              </tr>
                            </thead>
                            <tbody>
                              {milestones.map((milestone) => {
                                const planned = milestone.planned_hours ?? 0;
                                const logged = milestoneHours[milestone.id] ?? 0;
                                const progress =
                                  planned > 0
                                    ? Math.min(100, Math.round((logged / planned) * 100))
                                    : 0;
                                return (
                                  <tr key={milestone.id} className="qb-nested-row">
                                    <td className="py-4"></td>
                                    <td className="py-4">
                                      <div className="qb-input qb-input--static qb-milestone-title">
                                        {milestone.title ?? "Milestone"}
                                      </div>
                                    </td>
                                    <td className="py-4">
                                      <div className="qb-input qb-input--static">
                                        {milestone.description ?? "-"}
                                      </div>
                                    </td>
                                    <td className="py-4 text-center">
                                      <div className="qb-input qb-input--static">
                                        {formatDate(milestone.estimated_completion_date)}
                                      </div>
                                    </td>
                                    <td className="py-4 text-center">
                                      <div className="qb-input qb-input--static">{planned}</div>
                                    </td>
                                    <td className="py-4 text-center">
                                      <div className="qb-input qb-input--static">{logged}</div>
                                    </td>
                                    <td className="py-4 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                        <span className="w-10 text-right text-xs text-slate-500">
                                          {progress}%
                                        </span>
                                        <div className="relative h-2.5 w-24 rounded-full border border-slate-300 bg-white shadow-sm">
                                          <div
                                            className="absolute left-0 top-0 h-2.5 rounded-full bg-ocean"
                                            style={{ width: `${progress}%` }}
                                          />
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="qb-panel">
        <div className="qb-panel-header">Work Completion Logs</div>
        <div className="qb-panel-body space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
              Select date
              <select
                className="mt-2 w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={selectedDate ?? ""}
                onChange={(event) => {
                  setSelectedDate(event.target.value || null);
                  setLogPage(1);
                }}
              >
                <option value="">All dates</option>
                {Object.keys(timeEntriesByDate)
                  .sort()
                  .map((dateKey) => (
                    <option key={dateKey} value={dateKey}>
                      {formatDate(dateKey)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
              Deliverable
              <select
                className="mt-2 w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={selectedDeliverableId}
                onChange={(event) => {
                  setSelectedDeliverableId(event.target.value);
                  setSelectedMilestoneId("");
                  setLogPage(1);
                }}
              >
                <option value="">All deliverables</option>
                {payload.deliverables.map((deliverable) => (
                  <option key={deliverable.id} value={deliverable.id}>
                    {deliverable.title ?? "Deliverable"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
              Milestone
              <select
                className="mt-2 w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={selectedMilestoneId}
                onChange={(event) => {
                  setSelectedMilestoneId(event.target.value);
                  setLogPage(1);
                }}
                disabled={!selectedDeliverableId}
              >
                <option value="">All milestones</option>
                {payload.milestones
                  .filter((milestone) => milestone.project_deliverable_id === selectedDeliverableId)
                  .map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>
                      {milestone.title ?? "Milestone"}
                    </option>
                  ))}
              </select>
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {selectedDate ? (
                <>
                  Showing logs for <strong>{selectedDate}</strong> · Total hours{" "}
                  <strong>{selectedTotalHours}</strong>
                </>
              ) : (
                <>
                  Showing all logs · Total hours <strong>{selectedTotalHours}</strong>
                </>
              )}
            </div>
          </div>

          {selectedEntries.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              No time entries for this selection.
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {pagedEntries.map((entry) => {
                  const milestone = milestoneById[entry.project_milestone_id];
                  const deliverable =
                    milestone?.project_deliverable_id
                      ? deliverableById[milestone.project_deliverable_id]
                      : null;
                  return (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Date
                          </div>
                      <div className="text-sm font-semibold text-slate-700">
                        {formatDate(entry.entry_date)}
                      </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Hours
                          </div>
                          <div className="text-sm font-semibold text-slate-700">{entry.hours}</div>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Deliverable
                          </span>
                          <div className="mt-1">{deliverable?.title ?? "-"}</div>
                        </div>
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Milestone
                          </span>
                          <div className="mt-1">{milestone?.title ?? "-"}</div>
                        </div>
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Note
                          </span>
                          <div className="mt-1 text-slate-600">{entry.note ?? "-"}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-hidden rounded-xl border border-slate-200 md:block">
                <table className="w-full text-left text-sm">
                  <thead
                    className="text-xs uppercase tracking-wide text-white"
                    style={{ background: "#0f4b66" }}
                  >
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Deliverable</th>
                      <th className="px-4 py-3">Milestone</th>
                      <th className="px-4 py-3">Hours</th>
                      <th className="px-4 py-3">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEntries.map((entry) => {
                      const milestone = milestoneById[entry.project_milestone_id];
                      const deliverable =
                        milestone?.project_deliverable_id
                          ? deliverableById[milestone.project_deliverable_id]
                          : null;
                      return (
                        <tr key={entry.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 text-slate-600">
                            {formatDate(entry.entry_date)}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {deliverable?.title ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {milestone?.title ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{entry.hours}</td>
                          <td className="px-4 py-3 text-slate-600">{entry.note ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-3 text-xs text-slate-500">
              <span>
                Showing {(logPage - 1) * LOG_PAGE_SIZE + 1}–
                {Math.min(logPage * LOG_PAGE_SIZE, selectedEntries.length)} of{" "}
                {selectedEntries.length} entries
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1 text-slate-500 disabled:opacity-40"
                  onClick={() => setLogPage((prev) => Math.max(1, prev - 1))}
                  disabled={logPage === 1}
                >
                  Prev
                </button>
                <span className="text-slate-400">
                  Page {logPage} of {totalLogPages}
                </span>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1 text-slate-500 disabled:opacity-40"
                  onClick={() => setLogPage((prev) => Math.min(totalLogPages, prev + 1))}
                  disabled={logPage === totalLogPages}
                >
                  Next
                </button>
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

