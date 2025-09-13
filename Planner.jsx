import React, { useEffect, useMemo, useState } from "react";

export default function Planner() {
  // --- localStorage helpers ---
  const readLS = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  };
  const writeLS = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

  // --- defaults ---
  const defaultCats = [ { id: "work", name: "Work", targetHrs: 6 }, { id: "study", name: "Study", targetHrs: 8 } ];
  const commonTimeZones = ["UTC","Asia/Kolkata","Europe/London","America/New_York","America/Los_Angeles","Asia/Tokyo","Australia/Sydney"];

  // --- persistent state ---
  const [dayStart, setDayStart] = useState(readLS("pa.dayStart", { hour: 5, minute: 0 }));
  const [timeZone, setTimeZone] = useState(readLS("pa.timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
  const [showTZSelect, setShowTZSelect] = useState(false);
  const [showSeconds, setShowSeconds] = useState(readLS("pa.showSeconds", false));
  const [categories, setCategories] = useState(readLS("pa.categories", defaultCats));
  const [tasks, setTasks] = useState(readLS("pa.tasks", []));
  const [manualEntries, setManualEntries] = useState(readLS("pa.manualEntries", []));

  // timer state
  const [timerRunning, setTimerRunning] = useState(readLS("pa.timerRunning", false));
  const [timerStartAt, setTimerStartAt] = useState(readLS("pa.timerStartAt", null)); // ms timestamp
  const [timerElapsed, setTimerElapsed] = useState(readLS("pa.timerElapsed", 0)); // seconds when paused
  const [timerHistory, setTimerHistory] = useState(readLS("pa.timerHistory", [])); // {id,start,end,durationSec,savedCategoryId}

  // fullscreen timer
  const [timerFullscreen, setTimerFullscreen] = useState(readLS("pa.timerFullscreen", false));

  // inputs
  const initialCatId = (readLS("pa.categories", defaultCats)[0] || defaultCats[0]).id;
  const [newTask, setNewTask] = useState({ title: "", minutes: 30, category: initialCatId });
  const [quickDone, setQuickDone] = useState({ category: initialCatId, hours: 0, minutes: 0 });

  // persist
  useEffect(() => writeLS("pa.dayStart", dayStart), [dayStart]);
  useEffect(() => writeLS("pa.timeZone", timeZone), [timeZone]);
  useEffect(() => writeLS("pa.showSeconds", showSeconds), [showSeconds]);
  useEffect(() => writeLS("pa.categories", categories), [categories]);
  useEffect(() => writeLS("pa.tasks", tasks), [tasks]);
  useEffect(() => writeLS("pa.manualEntries", manualEntries), [manualEntries]);
  useEffect(() => writeLS("pa.timerRunning", timerRunning), [timerRunning]);
  useEffect(() => writeLS("pa.timerStartAt", timerStartAt), [timerStartAt]);
  useEffect(() => writeLS("pa.timerElapsed", timerElapsed), [timerElapsed]);
  useEffect(() => writeLS("pa.timerHistory", timerHistory), [timerHistory]);
  useEffect(() => writeLS("pa.timerFullscreen", timerFullscreen), [timerFullscreen]);

  // ensure inputs valid when categories change
  useEffect(() => {
    if (!categories.find((c) => c.id === newTask.category)) setNewTask((s) => ({ ...s, category: categories[0]?.id || defaultCats[0].id }));
    if (!categories.find((c) => c.id === quickDone.category)) setQuickDone((s) => ({ ...s, category: categories[0]?.id || defaultCats[0].id }));
  }, [categories]);

  // --- live clock ---
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  // --- day window (timezone-aware) ---
  const { windowStart, windowEnd, msLeft } = useMemo(() => {
    const n = new Date();
    const cand = new Date(n.toLocaleString("en-US", { timeZone }));
    cand.setHours(dayStart.hour || 0, dayStart.minute || 0, 0, 0);
    let start = cand;
    if (n < start) start = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { windowStart: start, windowEnd: end, msLeft: Math.max(0, end.getTime() - n.getTime()) };
  }, [now, dayStart, timeZone]);

  // --- derived ---
  const targetsMin = useMemo(() => { const m = {}; for (const c of categories) m[c.id] = Math.round((c.targetHrs || 0) * 60); return m; }, [categories]);
  const minutesDoneFromTasks = useMemo(() => { const sum = {}; for (const c of categories) sum[c.id] = 0; for (const t of tasks) if (t.completed && sum.hasOwnProperty(t.category)) sum[t.category] += Number(t.minutes || 0); return sum; }, [tasks, categories]);
  const minutesDoneFromManual = useMemo(() => { const sum = {}; for (const c of categories) sum[c.id] = 0; for (const e of manualEntries) if (sum.hasOwnProperty(e.categoryId)) sum[e.categoryId] += Number(e.minutes || 0); return sum; }, [manualEntries, categories]);
  const minutesDone = useMemo(() => { const sum = {}; for (const c of categories) sum[c.id] = (minutesDoneFromTasks[c.id] || 0) + (minutesDoneFromManual[c.id] || 0); return sum; }, [minutesDoneFromTasks, minutesDoneFromManual, categories]);
  const minutesPlannedRemaining = useMemo(() => { const sum = {}; for (const c of categories) sum[c.id] = 0; for (const t of tasks) if (!t.completed && sum.hasOwnProperty(t.category)) sum[t.category] += Number(t.minutes || 0); return sum; }, [tasks, categories]);
  const neededToday = useMemo(() => { const need = {}; for (const c of categories) { const target = targetsMin[c.id] || 0; const done = minutesDone[c.id] || 0; need[c.id] = Math.max(0, target - done); } return need; }, [targetsMin, minutesDone, categories]);

  const neededTotalMin = useMemo(() => Object.values(neededToday).reduce((s, x) => s + x, 0), [neededToday]);
  const plannedRemainingTotalMin = useMemo(() => Object.values(minutesPlannedRemaining).reduce((s, x) => s + x, 0), [minutesPlannedRemaining]);
  const workloadMin = Math.max(neededTotalMin, plannedRemainingTotalMin);

  const minutesLeft = Math.max(0, Math.floor(msLeft / 60000));
  const canFinish = workloadMin <= minutesLeft;
  const latestStart = useMemo(() => new Date(windowEnd.getTime() - workloadMin * 60000), [windowEnd, workloadMin]);

  const hoursLeft = minutesLeft / 60;
  const reminderState = hoursLeft > 6 ? "green" : hoursLeft > 2 ? "yellow" : "red";

  // --- helpers ---
  const fmtTime = (d, tz = timeZone) => {
    try { return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: showSeconds ? "2-digit" : undefined, timeZone: tz }); } catch { return new Date(d).toLocaleTimeString(); }
  };
  const fmtDur = (mins) => { const h = Math.floor(mins / 60); const m = mins % 60; if (h && m) return `${h}h ${m}m`; if (h) return `${h}h`; return `${m}m`; };
  const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.floor(Math.random() * 1000)}`);

  // --- CRUD ---
  const addTask = () => {
    if (!newTask.title.trim() || (!newTask.minutes && newTask.minutes !== 0) || !newTask.category) return;
    const minutes = Math.max(1, Number(newTask.minutes));
    setTasks((p) => [...p, { id: uid(), title: newTask.title.trim(), minutes, category: newTask.category, completed: false }]);
    setNewTask((s) => ({ ...s, title: "", minutes: 30 }));
  };
  const toggleTask = (id) => setTasks((p) => p.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  const deleteTask = (id) => setTasks((p) => p.filter((t) => t.id !== id));

  const addManualDone = (categoryId, minutes) => {
    if (!categoryId || !minutes) return;
    setManualEntries((p) => [...p, { id: uid(), categoryId, minutes: Math.max(1, Math.round(Number(minutes))) }]);
  };
  const deleteManualEntry = (id) => setManualEntries((p) => p.filter((e) => e.id !== id));

  const addCategory = (name) => {
    const nm = (name || "New").trim() || "New";
    const base = nm.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    let id = base || `cat-${Date.now()}`;
    let i = 1; while (categories.find((c) => c.id === id)) id = `${base}-${i++}`;
    setCategories((p) => [...p, { id, name: nm, targetHrs: 1 }]);
  };
  const removeCategory = (id) => {
    setCategories((p) => p.filter((c) => c.id !== id));
    setTasks((p) => p.filter((t) => t.category !== id));
    setManualEntries((p) => p.filter((e) => e.categoryId !== id));
  };
  const renameCategory = (id, newName) => setCategories((p) => p.map((c) => (c.id === id ? { ...c, name: newName } : c)));
  const setCategoryTarget = (id, hrs) => setCategories((p) => p.map((c) => (c.id === id ? { ...c, targetHrs: Math.max(0, Number(hrs) || 0) } : c)));

  // --- Timer logic ---
  useEffect(() => {
    let interval = null;
    if (timerRunning && timerStartAt) {
      interval = setInterval(() => {
        const nowSec = Math.floor(Date.now() / 1000);
        setTimerElapsed(nowSec - Math.floor(timerStartAt / 1000));
      }, 500);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [timerRunning, timerStartAt]);

  // start or resume the timer without losing accumulated time
const startTimer = () => {
  // If we have previously accumulated seconds (timerElapsed) use it to set
  // startAt in the past so the running elapsed continues from that value.
  const baseSec = Math.max(0, Number(timerElapsed) || 0);
  const startTs = Date.now() - baseSec * 1000;
  setTimerStartAt(startTs);
  setTimerRunning(true);
  // don't reset timerElapsed here — we use it as the accumulated offset
};

  const pauseTimer = () => {
    if (!timerRunning || !timerStartAt) return;
    const elapsedSec = Math.floor(Date.now() / 1000) - Math.floor(timerStartAt / 1000);
    setTimerElapsed(elapsedSec);
    setTimerRunning(false);
    setTimerStartAt(null);
  };
  const stopAndRecord = () => {
    if (!timerRunning && !timerStartAt && timerElapsed === 0) return;
    let duration = timerElapsed;
    const endTs = Date.now();
    if (timerRunning && timerStartAt) {
      duration = Math.floor(endTs / 1000) - Math.floor(timerStartAt / 1000);
    }
    const rec = { id: uid(), start: timerStartAt || null, end: endTs, durationSec: Math.max(0, Math.floor(duration)), savedCategoryId: null };
    setTimerHistory((p) => [rec, ...p].slice(0, 200)); // cap growth
    setTimerRunning(false);
    setTimerStartAt(null);
    setTimerElapsed(0);
  };

  // Save a history record into a category (uses prompt for simplicity)
  const saveRecordToCategory = (recId) => {
    const rec = timerHistory.find((r) => r.id === recId);
    if (!rec) return alert("Record not found.");
    if (rec.savedCategoryId) return alert("This record is already saved to a category.");
    if (!categories.length) return alert("No categories exist. Create one first.");

    // simple prompt listing categories
    let promptText = "Save this session to which category? Enter number:\n";
    categories.forEach((c, idx) => { promptText += `${idx + 1}) ${c.name}\n`; });

    const raw = prompt(promptText, "1");
    if (!raw) return;
    const choice = Number(raw);
    if (!choice || choice < 1 || choice > categories.length) return alert("Invalid choice.");

    const chosen = categories[choice - 1];
    const mins = Math.max(1, Math.round((rec.durationSec || 0) / 60));
    addManualDone(chosen.id, mins);
    setTimerHistory((prev) => prev.map((r) => r.id === recId ? { ...r, savedCategoryId: chosen.id } : r));
    alert(`Saved ${mins}m to ${chosen.name}.`);
  };

  // helper to format seconds
  const fmtSeconds = (s) => {
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
    if (h) return `${h}h ${m}m ${sec}s`;
    if (m) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  const toggleTZ = () => setShowTZSelect((v) => !v);
  const toggleFullscreen = () => setTimerFullscreen((v) => !v);

  // --- small components ---
  function StatTile({ title, value, hint }) {
    return (
      <div className="stat-item">
        <div className="small-muted" style={{ fontWeight: 700 }}>{title}</div>
        <div className="big-number">{value}</div>
        {hint && <div className="small-muted">{hint}</div>}
      </div>
    );
  }

  function ProgressBar({ percent }) { const p = Math.max(0, Math.min(100, Math.round(percent))); return (
    <div className="w-full bg-gray-200 rounded h-3 overflow-hidden"><div style={{ width: `${p}%` }} className="h-3 bg-blue-500" /></div>
  ); }

  function TaskColumn({ category }) {
    const catId = category.id;
    const catTasks = tasks.filter((t) => t.category === catId);
    const catManual = manualEntries.filter((e) => e.categoryId === catId);
    const doneMin = minutesDone[catId] || 0;
    const targetMin = targetsMin[catId] || 0;
    const pct = targetMin ? (doneMin / targetMin) * 100 : 0;

    return (
      <div className="border rounded p-3 bg-white">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-medium">{category.name}</div>
            <div className="text-xs text-gray-500">{fmtDur(doneMin)} done / {fmtDur(targetMin)} target</div>
          </div>
          <div className="text-sm text-gray-500">Planned: {fmtDur((catTasks.filter((t) => !t.completed).reduce((s, x) => s + Number(x.minutes || 0), 0) || 0) + catManual.reduce((s, x) => s + Number(x.minutes || 0), 0))}</div>
        </div>

        <ProgressBar percent={pct} />

        <div className="mt-3 space-y-2">
          {catTasks.length === 0 && catManual.length === 0 && <div className="text-sm text-gray-500">No tasks or manual entries.</div>}

          {catTasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={!!t.completed} onChange={() => toggleTask(t.id)} />
                <div>
                  <div className={`text-sm ${t.completed ? "line-through text-gray-500" : ""}`}>{t.title}</div>
                  <div className="text-xs text-gray-500">{t.minutes}m</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="text-xs text-red-600" onClick={() => deleteTask(t.id)}>Delete</button>
              </div>
            </div>
          ))}

          {catManual.map((e) => (
            <div key={e.id} className="flex items-center justify-between p-2 rounded bg-white border">
              <div>
                <div className="text-sm">Manual entry</div>
                <div className="text-xs text-gray-500">{fmtDur(e.minutes)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="text-xs text-red-600" onClick={() => deleteManualEntry(e.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- render ---
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Progress-Aware Day Planner</h1>
            <div className="text-sm text-gray-600">Day window: {fmtTime(windowStart)} → {fmtTime(windowEnd)}</div>
          </div>

          <div>
            <div className={`status-box ${reminderState}`}>
              <div style={{ marginRight: 12 }}>
                <div className="status-label" style={{ fontSize: 12 }}>Status</div>
                <div className="status-text" style={{ fontWeight: 700 }}>{reminderState === "green" ? "Good — lots of time" : reminderState === "yellow" ? "Caution — time shrinking" : "Urgent — very little time"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="status-small">Hours left</div>
                <div className="status-big">{hoursLeft.toFixed(2)}h</div>
              </div>
            </div>
          </div>
        </header>

        {/* Day start & timezone */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white p-2 rounded border">
            <label className="text-xs text-gray-600">Day starts at</label>
            <input type="number" min={0} max={23} value={dayStart.hour} onChange={(e) => setDayStart((s) => ({ ...s, hour: Math.min(23, Math.max(0, Number(e.target.value))) }))} className="w-16 border p-1 rounded" />
            <span>:</span>
            <input type="number" min={0} max={59} value={dayStart.minute} onChange={(e) => setDayStart((s) => ({ ...s, minute: Math.min(59, Math.max(0, Number(e.target.value))) }))} className="w-16 border p-1 rounded" />
          </div>

          <div className="relative">
            <button className="flex items-center gap-2 bg-white p-2 rounded border tz-button" onClick={toggleTZ}>
              <span className="text-sm">{timeZone}</span>
              <span className="text-xs">▾</span>
            </button>

            {showTZSelect && (
              <div className="tz-dropdown-floating" role="dialog" aria-label="Timezone selector">
                <div className="text-xs text-gray-500 mb-2">Select timezone</div>
                <div className="tz-list">
                  {commonTimeZones.map((tz) => (
                    <div key={tz}>
                      <button className="w-full text-left p-2 tz-item" onClick={() => { setTimeZone(tz); setShowTZSelect(false); }}>{tz}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <section className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="card-title">Today summary</div>
          </div>

          <div className="stat-grid" style={{ marginTop: 8 }}>
            <StatTile title="Time left today" value={fmtDur(minutesLeft)} />
            <StatTile title="Workload left (today)" value={fmtDur(workloadMin)} />
            <div className="stat-item" style={{ gridColumn: "1 / -1" }}>
              <div className="small-muted" style={{ fontWeight: 700 }}>Latest start</div>
              <div className="big-number">{fmtTime(latestStart)}</div>
              <div className="small-muted">{canFinish ? "Still possible" : "Not enough time"}</div>
            </div>
          </div>
        </section>

        {/* Workspace / Tasks */}
        <section className="two-col" style={{ marginTop: 16 }}>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div className="card-title">Workspace</div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div className="space-y-3">
                {/* Categories */}
                <div className="border rounded p-3 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">Categories</div>
                    <div>
                      <button className="text-sm px-3 py-1 border rounded" onClick={() => { const name = prompt("Category name:", "New") || "New"; addCategory(name); }}>+ Add</button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {categories.map((c) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <input className="border p-1 rounded w-36" value={c.name} onChange={(e) => renameCategory(c.id, e.target.value)} />
                        <div className="text-sm text-gray-600">Target (hrs)</div>
                        <input type="number" step="0.5" value={c.targetHrs} onChange={(e) => setCategoryTarget(c.id, e.target.value)} className="border p-1 rounded w-24" />
                        <div className="text-xs text-gray-500">Done: {fmtDur(minutesDone[c.id] || 0)}</div>
                        <button className="text-xs text-red-600 ml-auto" onClick={() => removeCategory(c.id)}>Delete</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Task */}
                <div className="border rounded p-3 bg-white">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div className="font-medium">Add Task</div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <input className="border p-2 rounded" placeholder="Task title" value={newTask.title} onChange={(e) => setNewTask((s) => ({ ...s, title: e.target.value }))} />
                    <div className="flex items-center gap-2">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="number" className="border p-2 rounded w-28" value={newTask.minutes} onChange={(e) => setNewTask((s) => ({ ...s, minutes: Math.max(0, Number(e.target.value) || 0) }))} />
                        <div className="text-xs text-gray-500">mins</div>
                      </div>
                      <select className="border p-2 rounded flex-1" value={newTask.category} onChange={(e) => setNewTask((s) => ({ ...s, category: e.target.value }))}>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <div className="flex justify-end" style={{ gap: 8 }}>
                      <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={addTask}>Add Task</button>
                    </div>
                  </div>
                </div>

                {/* Quick add done time */}
                <div className="border rounded p-3 bg-white">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div className="font-medium">Quick add done time</div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center gap-2">
                      <select className="border p-2 rounded" value={quickDone.category} onChange={(e) => setQuickDone((s) => ({ ...s, category: e.target.value }))}>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>

                      <div className="flex items-center gap-2">
                        <input type="number" placeholder="hrs" className="border p-2 rounded w-24" value={quickDone.hours} onChange={(e) => setQuickDone((s) => ({ ...s, hours: Math.max(0, Number(e.target.value) || 0) }))} />
                        <div className="text-xs text-gray-500">h</div>
                        <input type="number" placeholder="mins" className="border p-2 rounded w-24" value={quickDone.minutes} onChange={(e) => setQuickDone((s) => ({ ...s, minutes: Math.max(0, Math.min(59, Number(e.target.value) || 0)) }))} />
                        <div className="text-xs text-gray-500">m</div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={() => {
                        const cat = quickDone.category || categories[0]?.id;
                        const mins = (Number(quickDone.hours || 0) * 60) + Number(quickDone.minutes || 0);
                        if (!cat || !mins) return;
                        addManualDone(cat, mins);
                        setQuickDone({ category: categories[0]?.id || defaultCats[0].id, hours: 0, minutes: 0 });
                      }}>Add Done Time</button>
                    </div>

                    <div className="mt-3">
                      <div className="text-sm font-medium">Manual entries</div>
                      <div className="space-y-1 mt-2">
                        {manualEntries.length === 0 && <div className="text-xs text-gray-500">No manual entries yet.</div>}
                        {manualEntries.map((e) => (
                          <div key={e.id} className="flex items-center justify-between p-2 border rounded bg-white">
                            <div className="text-sm">{categories.find((c) => c.id === e.categoryId)?.name || e.categoryId} — {fmtDur(e.minutes)}</div>
                            <button className="text-xs text-red-600" onClick={() => deleteManualEntry(e.id)}>Delete</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timer UI */}
                <div className="border rounded p-3 bg-white">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div className="font-medium">Timer</div>
                    <div className="text-xs text-gray-500">Session: {timerRunning ? "Running" : timerElapsed ? "Paused" : "Idle"}</div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div className="text-2xl font-semibold">{fmtSeconds(timerRunning && timerStartAt ? Math.floor((Date.now()/1000) - Math.floor(timerStartAt/1000)) : timerElapsed)}</div>

                    <div style={{ display: "flex", gap: 8 }}>
                      {!timerFullscreen ? (
                        <button className="px-3 py-1 border rounded" onClick={toggleFullscreen}>Fullscreen</button>
                      ) : (
                        <button className="px-3 py-1 border rounded" onClick={toggleFullscreen}>Exit Fullscreen</button>
                      )}

                      {!timerRunning ? (
                        <>
                          <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={startTimer}>Start</button>
                          <button className="px-3 py-1 border rounded" onClick={() => { const el = document.getElementById('timer-history'); if (el) el.scrollIntoView({ behavior:'smooth' }); }}>History</button>
                        </>
                      ) : (
                        <>
                          <button className="px-3 py-1 bg-red-600 text-white rounded" onClick={stopAndRecord}>Stop & Record</button>
                          <button className="px-3 py-1 border rounded" onClick={pauseTimer}>Pause</button>
                        </>
                      )}
                    </div>
                  </div>

                  <div id="timer-history" className="mt-3">
                    <div className="text-sm font-medium">History (last {timerHistory.length}):</div>
                    <div className="space-y-1 mt-2">
                      {timerHistory.length === 0 && <div className="text-xs text-gray-500">No history yet.</div>}
                      {timerHistory.map((h) => (
                        <div key={h.id} className="flex items-center justify-between p-2 border rounded bg-white">
                          <div className="text-sm">{new Date(h.start || h.end).toLocaleString()} — {fmtSeconds(h.durationSec)}</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            {!h.savedCategoryId ? (
                              <button className="text-xs px-2 py-1 border rounded" onClick={() => saveRecordToCategory(h.id)}>Save</button>
                            ) : (
                              <div className="text-xs text-gray-600">Saved: {categories.find(c=>c.id===h.savedCategoryId)?.name || h.savedCategoryId}</div>
                            )}
                            <button className="text-xs text-red-600" onClick={() => setTimerHistory((p) => p.filter(x => x.id !== h.id))}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div className="card-title">Tasks overview</div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div className="space-y-3">
                {categories.length === 0 && <div className="text-sm text-gray-500">No categories — add one to start.</div>}
                <div className="grid gap-3">
                  {categories.map((c) => (<TaskColumn key={c.id} category={c} />))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="text-xs text-gray-500 text-center">Tip: After stopping the timer, click Save next to the record to assign that time to a category — it will be recorded as done time.</footer>
      </div>

      {/* Fullscreen overlay for timer */}
      {timerFullscreen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(3,6,12,0.92)", // darker but not full black
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 99999,
          flexDirection: "column",
          gap: 20,
          padding: 24
        }}>
          {/* Exit button in top-right corner (red) */}
          <button
            onClick={() => setTimerFullscreen(false)}
            style={{
              position: "absolute",
              top: 18,
              right: 18,
              background: "#dc2626",
              color: "#fff",
              border: "none",
              padding: "8px 10px",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
              fontWeight: 700
            }}
          >
            Exit
          </button>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 64, fontWeight: 800 }}>{fmtSeconds(timerRunning && timerStartAt ? Math.floor((Date.now()/1000) - Math.floor(timerStartAt/1000)) : timerElapsed)}</div>
            <div style={{ marginTop: 8, opacity: 0.9 }}>{timerRunning ? "Running" : timerElapsed ? "Paused" : "Idle"}</div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            {!timerRunning ? (
              <>
                {/* Start now stays in fullscreen (does NOT auto-exit) */}
                <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={() => startTimer()}>Start</button>
                {/* Exit already in top-right, no Back button */}
              </>
            ) : (
              <>
                {/* Pause now only pauses (does NOT exit fullscreen) */}
                <button className="px-4 py-2 border rounded" onClick={() => pauseTimer()}>Pause</button>
                <button className="px-4 py-2 bg-red-600 text-white rounded" onClick={() => { stopAndRecord(); /* keep user in normal flow but we can keep fullscreen open or close - keep open to let them Save from history */ }}>Stop & Record</button>
                {/* Exit in corner covers leaving fullscreen */}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
