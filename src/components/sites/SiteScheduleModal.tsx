import { useId, useState } from "react";

import {
  useRunSiteScheduleNow,
  useSiteSchedule,
  useUpdateSiteSchedule,
} from "../../hooks/useSites";
import { errorDetail } from "../../lib/errors";
import type { Site, SiteSchedule, SiteScheduleCadence } from "../../types/site";
import Modal from "../Modal";
import { ErrorPanel, SkeletonRows } from "../QueryState";

const WEEKDAYS = [
  [0, "Monday"],
  [1, "Tuesday"],
  [2, "Wednesday"],
  [3, "Thursday"],
  [4, "Friday"],
  [5, "Saturday"],
  [6, "Sunday"],
] as const;

const TIMEZONES = [
  "UTC",
  "Africa/Casablanca",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Tokyo",
];

type ScheduleForm = {
  enabled: boolean;
  cadence: SiteScheduleCadence;
  weekday: number | null;
  localTime: string;
  timezone: string;
};

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const emptyForm = (): ScheduleForm => ({
  enabled: false,
  cadence: "daily",
  weekday: null,
  localTime: "02:00",
  timezone: browserTimeZone(),
});

const toForm = (schedule: SiteSchedule): ScheduleForm => ({
  enabled: schedule.enabled,
  cadence: schedule.cadence,
  weekday: schedule.weekday,
  localTime: schedule.local_time.slice(0, 5),
  timezone: schedule.timezone,
});

const formatDateTime = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
};

const runStatusLabel = (status: SiteSchedule["last_run_status"]) => {
  if (!status) return null;
  return status === "partial_failed" ? "partially failed" : status;
};

export default function SiteScheduleModal({
  site,
  onClose,
  onSaved,
}: {
  site: Site;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const scheduleQuery = useSiteSchedule(site.id);
  const update = useUpdateSiteSchedule(site.id);
  const runNow = useRunSiteScheduleNow();
  const [draft, setDraft] = useState<Partial<ScheduleForm>>({});
  const [error, setError] = useState<string | null>(null);
  const timezoneListId = useId();

  const loaded = !scheduleQuery.isPending && !scheduleQuery.isError;
  const form = loaded
    ? { ...(scheduleQuery.data ? toForm(scheduleQuery.data) : emptyForm()), ...draft }
    : null;
  const set = (patch: Partial<ScheduleForm>) => {
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const save = async () => {
    if (!form || update.isPending) return;
    const timezone = form.timezone.trim();
    if (!timezone) {
      setError("Enter an IANA timezone, such as Africa/Casablanca.");
      return;
    }
    if (!form.localTime) {
      setError("Choose a time for the scheduled refresh.");
      return;
    }
    if (form.cadence === "weekly" && form.weekday === null) {
      setError("Choose a weekday for a weekly refresh.");
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({
        enabled: form.enabled,
        cadence: form.cadence,
        weekday: form.cadence === "weekly" ? form.weekday : null,
        local_time: form.localTime,
        timezone,
      });
      onSaved("Automation schedule saved.");
      onClose();
    } catch (caught) {
      setError(errorDetail(caught, "The automation schedule could not be saved."));
    }
  };

  const run = async () => {
    if (runNow.isPending) return;
    setError(null);
    try {
      await runNow.mutateAsync(site.id);
      onSaved("Crawl and analysis queued.");
      onClose();
    } catch (caught) {
      setError(errorDetail(caught, "The crawl and analysis could not be queued."));
    }
  };

  const nextRun = formatDateTime(scheduleQuery.data?.next_run_at ?? null);
  const lastRun = formatDateTime(scheduleQuery.data?.last_run_finished_at ?? null);
  const lastAttempt = formatDateTime(scheduleQuery.data?.last_attempt_at ?? null);
  const lastStatus = runStatusLabel(scheduleQuery.data?.last_run_status ?? null);

  return (
    <Modal
      title={`Schedule refresh · ${site.name}`}
      description="A refresh crawls the live site first, then analyzes the new snapshot. Publishing is never automatic."
      onClose={onClose}
      panelClassName="max-w-2xl"
    >
      {scheduleQuery.isPending && (
        <SkeletonRows count={4} label="Loading site automation schedule" />
      )}
      {scheduleQuery.isError && (
        <ErrorPanel
          title="Automation schedule could not be loaded"
          description="The engine did not return this site's refresh settings."
          onRetry={() => void scheduleQuery.refetch()}
          retrying={scheduleQuery.isFetching}
        />
      )}

      {form && (
        <div className="space-y-5">
          <label className="flex items-start gap-3 rounded-lg bg-surface-strong p-3">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => set({ enabled: event.target.checked })}
            />
            <span>
              <span className="block text-body-sm font-medium text-ink">
                Run refresh automatically
              </span>
              <span className="mt-1 block text-caption leading-relaxed text-muted">
                The scheduler will queue one crawl followed by analysis when this schedule is due.
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-caption font-medium text-ink">Repeat</span>
              <select
                className="field"
                value={form.cadence}
                onChange={(event) => {
                  const cadence = event.target.value as SiteScheduleCadence;
                  set({ cadence, weekday: cadence === "weekly" ? form.weekday ?? 0 : null });
                }}
              >
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-caption font-medium text-ink">Time</span>
              <input
                className="field"
                type="time"
                value={form.localTime}
                onChange={(event) => set({ localTime: event.target.value })}
              />
            </label>
          </div>

          {form.cadence === "weekly" && (
            <label className="block">
              <span className="mb-1 block text-caption font-medium text-ink">Weekday</span>
              <select
                className="field"
                value={form.weekday ?? 0}
                onChange={(event) => set({ weekday: Number(event.target.value) })}
              >
                {WEEKDAYS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-caption font-medium text-ink">Timezone</span>
            <input
              className="field"
              list={timezoneListId}
              value={form.timezone}
              onChange={(event) => set({ timezone: event.target.value })}
              placeholder="Africa/Casablanca"
            />
            <datalist id={timezoneListId}>
              {TIMEZONES.map((timezone) => (
                <option key={timezone} value={timezone} />
              ))}
            </datalist>
            <span className="mt-1 block text-caption-sm leading-relaxed text-muted">
              Use an IANA timezone. The selected local time follows daylight-saving changes where
              applicable.
            </span>
          </label>

          {scheduleQuery.data && (
            <div className="rounded-lg border border-hairline bg-canvas-soft p-4 text-caption text-muted">
              <div className="grid gap-2 sm:grid-cols-2">
                <span>
                  Next refresh: <strong className="font-medium text-ink">{nextRun ?? "Paused"}</strong>
                </span>
                <span>
                  Last run: <strong className="font-medium text-ink">{lastRun ?? "Never"}</strong>
                </span>
                {lastStatus && (
                  <span>
                    Last result: <strong className="font-medium text-ink">{lastStatus}</strong>
                  </span>
                )}
                {lastAttempt && (
                  <span>
                    Last scheduler attempt: <strong className="font-medium text-ink">{lastAttempt}</strong>
                  </span>
                )}
              </div>
              {(scheduleQuery.data.last_run_error || scheduleQuery.data.last_attempt_error) && (
                <p className="mt-3 border-t border-hairline pt-3 text-error-ink">
                  {scheduleQuery.data.last_run_error || scheduleQuery.data.last_attempt_error}
                </p>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="text-caption text-error-ink">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              className="btn btn-outline sm:mr-auto"
              disabled={runNow.isPending}
              onClick={() => void run()}
            >
              {runNow.isPending ? "Queueing…" : "Run now"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={update.isPending}
              onClick={() => void save()}
            >
              {update.isPending ? "Saving…" : "Save schedule"}
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
