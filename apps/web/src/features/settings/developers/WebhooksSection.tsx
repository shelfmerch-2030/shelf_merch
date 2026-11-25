import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Clock3,
  History,
  KeyRound,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createWebhook,
  deleteWebhook,
  getWebhookDelivery,
  listWebhookDeliveries,
  listWebhooks,
  resendWebhookDelivery,
  revealWebhookSecret,
  rotateWebhookSecret,
  sendWebhookTest,
  updateWebhook,
  type ApiKeyMode,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "@/services/developers-api";
import "./webhooks-section.css";

const EVENT_HELP: Record<string, string> = {
  "order.received": "Order accepted",
  "order.updated": "Address, notes or metadata changed",
  "order.in_production": "Production started",
  "order.shipped": "Handed to courier (includes tracking)",
  "order.delivered": "Delivered",
  "order.on_hold": "Paused — ShelfMerch will contact you",
  "order.cancelled": "Cancelled",
};

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Request failed";
}

function when(v: string | null) {
  return v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Copy failed"),
  );
}

function health(e: WebhookEndpoint) {
  if (!e.enabled)
    return (
      <span className="tag tag-warn" title={e.disabledReason}>
        Disabled
      </span>
    );
  if (e.consecutiveFailures > 0)
    return (
      <span className="tag tag-warn" title={`Failing since ${when(e.failingSince)}`}>
        Failing ({e.consecutiveFailures})
      </span>
    );
  return <span className="tag tag-live">Healthy</span>;
}

/** Webhook endpoints, their signing secrets and delivery logs. */
export function WebhooksSection() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[] | null>(null);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [secret, setSecret] = useState<{ title: string; value: string } | null>(null);
  const [logFor, setLogFor] = useState<WebhookEndpoint | null>(null);
  const [busyId, setBusyId] = useState("");

  const reload = useCallback(() => {
    listWebhooks()
      .then((r) => {
        setEndpoints(r.items);
        setEventTypes(r.eventTypes);
      })
      .catch((e) => toast.error(errorText(e)));
  }, []);
  useEffect(reload, [reload]);

  async function act(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="settings-section webhooks-section" aria-labelledby="webhooks-heading">
      <div className="webhooks-section__header">
        <div className="webhooks-section__intro">
          <span className="webhooks-section__icon">
            <Webhook size={20} aria-hidden="true" />
          </span>
          <div>
            <div className="webhooks-section__title-row">
              <h3 id="webhooks-heading" className="webhooks-section__title">
                Webhooks
              </h3>
              {endpoints && (
                <span className="webhooks-section__count">
                  {endpoints.length} {endpoints.length === 1 ? "endpoint" : "endpoints"}
                </span>
              )}
            </div>
            <p className="webhooks-section__subtitle">
              We POST signed events to your URL when an order changes.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-brand btn-sm webhooks-section__add"
          onClick={() => setAddOpen(true)}
        >
          <Plus size={15} aria-hidden="true" /> Add endpoint
        </button>
      </div>

      <div className="webhooks-section__notice">
        <ShieldCheck size={17} aria-hidden="true" />
        <div>
          <p>
            Verify the <code>ShelfMerch-Signature</code> header with the endpoint's secret, and
            dedupe by <code>ShelfMerch-Event-Id</code>.
          </p>
          <p>Failed deliveries are retried for 3 days.</p>
        </div>
      </div>

      {!endpoints ? (
        <div className="webhooks-section__empty" role="status">
          <Loader2 className="webhooks-section__spinner" size={24} aria-hidden="true" />
          <p>Loading endpoints…</p>
        </div>
      ) : !endpoints.length ? (
        <div className="webhooks-section__empty">
          <span className="webhooks-section__icon">
            <Webhook size={24} aria-hidden="true" />
          </span>
          <h4>No webhook endpoints yet.</h4>
          <p>Add an endpoint to receive order updates on your server.</p>
        </div>
      ) : (
        <ul className="webhooks-section__list" aria-label="Webhook endpoints">
          {endpoints.map((e) => (
            <li
              key={e.id}
              className="webhook-endpoint"
              aria-label={e.url}
              aria-busy={busyId === e.id}
            >
              <div className="webhook-endpoint__header">
                <div className="webhook-endpoint__identity">
                  <span className={`tag ${e.mode === "live" ? "tag-live" : "tag-draft"}`}>
                    {e.mode === "live" ? "Live" : "Test"}
                  </span>
                  <code className="webhook-endpoint__url">{e.url}</code>
                </div>
                {health(e)}
              </div>
              {e.description && <p className="webhook-endpoint__description">{e.description}</p>}
              <dl className="webhook-endpoint__details">
                <div>
                  <dt>Events</dt>
                  <dd className="webhook-endpoint__events">
                    {e.events.length ? (
                      e.events.map((event) => <code key={event}>{event}</code>)
                    ) : (
                      <span>All events</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>
                    <Clock3 size={13} aria-hidden="true" /> Last success
                  </dt>
                  <dd>
                    {e.lastSuccessAt ? (
                      <time dateTime={e.lastSuccessAt}>{when(e.lastSuccessAt)}</time>
                    ) : (
                      "No successful deliveries yet"
                    )}
                  </dd>
                </div>
              </dl>
              <div className="webhook-endpoint__actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyId === e.id || !e.enabled}
                  onClick={() =>
                    act(e.id, async () => {
                      const d = await sendWebhookTest(e.id);
                      if (d.status === "succeeded")
                        toast.success(`Test event delivered (HTTP ${d.responseStatus})`);
                      else toast.error(`Test failed: ${d.error || `HTTP ${d.responseStatus}`}`);
                      reload();
                    })
                  }
                >
                  <Send size={14} aria-hidden="true" /> Send test
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLogFor(e)}>
                  <History size={14} aria-hidden="true" /> Deliveries
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm webhook-endpoint__manage"
                      disabled={busyId === e.id}
                      aria-label={`Manage ${e.url}`}
                    >
                      {busyId === e.id && (
                        <Loader2
                          className="webhooks-section__spinner"
                          size={14}
                          aria-hidden="true"
                        />
                      )}
                      Manage <ChevronDown size={14} aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="webhooks-menu">
                    <DropdownMenuItem
                      onSelect={() =>
                        void act(e.id, async () => {
                          setSecret({
                            title: "Signing secret",
                            value: (await revealWebhookSecret(e.id)).secret,
                          });
                        })
                      }
                    >
                      <KeyRound size={14} aria-hidden="true" /> Signing secret
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        if (
                          !window.confirm(
                            "Rotate the signing secret? Signatures made with the old secret stop verifying immediately.",
                          )
                        )
                          return;
                        void act(e.id, async () =>
                          setSecret({
                            title: "New signing secret",
                            value: (await rotateWebhookSecret(e.id)).secret,
                          }),
                        );
                      }}
                    >
                      Rotate secret
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() =>
                        void act(e.id, async () => {
                          await updateWebhook(e.id, { enabled: !e.enabled });
                          reload();
                        })
                      }
                    >
                      {e.enabled ? "Disable" : "Enable"} endpoint
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="webhooks-menu__delete"
                      onSelect={() => {
                        if (
                          !window.confirm(
                            `Delete the endpoint ${e.url}? Pending deliveries are dropped.`,
                          )
                        )
                          return;
                        void act(e.id, async () => {
                          await deleteWebhook(e.id);
                          reload();
                        });
                      }}
                    >
                      Delete endpoint
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddEndpointDialog
        open={addOpen}
        eventTypes={eventTypes}
        onOpenChange={setAddOpen}
        onCreated={(s) => {
          setAddOpen(false);
          setSecret({ title: "Endpoint created — copy its signing secret", value: s });
          reload();
        }}
      />
      <SecretDialog value={secret} onClose={() => setSecret(null)} />
      {logFor && <DeliveriesDialog endpoint={logFor} onClose={() => setLogFor(null)} />}
    </section>
  );
}

function AddEndpointDialog({
  open,
  eventTypes,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  eventTypes: string[];
  onOpenChange: (o: boolean) => void;
  onCreated: (secret: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<ApiKeyMode>("test");
  const [description, setDescription] = useState("");
  const [all, setAll] = useState(true);
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl("");
      setMode("test");
      setDescription("");
      setAll(true);
      setEvents([]);
    }
  }, [open]);

  async function submit() {
    setBusy(true);
    try {
      const res = await createWebhook({
        url: url.trim(),
        mode,
        description: description.trim() || undefined,
        events: all ? [] : events,
      });
      onCreated(res.secret);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add webhook endpoint</DialogTitle>
          <DialogDescription>
            A public https URL on your server that accepts POST requests.
          </DialogDescription>
        </DialogHeader>
        <div className="field">
          <label className="lbl" htmlFor="wh-url">
            Endpoint URL
          </label>
          <input
            id="wh-url"
            className="inp"
            placeholder="https://api.yourstore.com/webhooks/shelfmerch"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="lbl" htmlFor="wh-desc">
            Description (optional)
          </label>
          <input
            id="wh-desc"
            className="inp"
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="lbl">Receives events for</span>
          <div className="row" style={{ gap: 16 }}>
            {(["test", "live"] as const).map((m) => (
              <label key={m} className="row" style={{ gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  name="wh-mode"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {m === "test" ? "Test orders" : "Live orders"}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="lbl">Events</span>
          <label className="row" style={{ gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All
            events (including ones added later)
          </label>
          {!all &&
            eventTypes.map((t) => (
              <label
                key={t}
                className="row"
                style={{ gap: 6, alignItems: "center", marginLeft: 20 }}
              >
                <input
                  type="checkbox"
                  checked={events.includes(t)}
                  onChange={(e) =>
                    setEvents((cur) =>
                      e.target.checked ? [...cur, t] : cur.filter((x) => x !== t),
                    )
                  }
                />
                <code style={{ fontSize: 12 }}>{t}</code>{" "}
                <span className="muted" style={{ fontSize: 12 }}>
                  {EVENT_HELP[t]}
                </span>
              </label>
            ))}
        </div>
        <DialogFooter>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-brand btn-sm"
            disabled={busy || !url.trim() || (!all && !events.length)}
            onClick={submit}
          >
            {busy ? "Adding…" : "Add endpoint"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretDialog({
  value,
  onClose,
}: {
  value: { title: string; value: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(value)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{value?.title}</DialogTitle>
          <DialogDescription>
            Store it on your server and use it to verify the ShelfMerch-Signature header.
          </DialogDescription>
        </DialogHeader>
        {value && (
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <code
              style={{
                wordBreak: "break-all",
                flex: 1,
                padding: 10,
                background: "var(--bg-2, #f5f5f5)",
                borderRadius: 8,
              }}
            >
              {value.value}
            </code>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => copy(value.value)}>
              Copy
            </button>
          </div>
        )}
        <DialogFooter>
          <button type="button" className="btn btn-brand btn-sm" onClick={onClose}>
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveriesDialog({
  endpoint,
  onClose,
}: {
  endpoint: WebhookEndpoint;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<WebhookDelivery[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<unknown>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(() => {
    listWebhookDeliveries(endpoint.id, page)
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch((e) => toast.error(errorText(e)));
  }, [endpoint.id, page]);
  useEffect(load, [load]);

  async function resend(d: WebhookDelivery) {
    setBusyId(d._id);
    try {
      const r = await resendWebhookDelivery(d._id);
      if (r.status === "succeeded") toast.success("Delivered");
      else toast.error(r.error || "Delivery failed — it will be retried");
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusyId("");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ maxWidth: 960 }}>
        <DialogHeader>
          <DialogTitle>Deliveries</DialogTitle>
          <DialogDescription style={{ wordBreak: "break-all" }}>
            {endpoint.url} · kept for 30 days
          </DialogDescription>
        </DialogHeader>
        {!rows ? (
          <p className="muted">Loading…</p>
        ) : !rows.length ? (
          <p className="muted">No deliveries yet.</p>
        ) : (
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Result</th>
                  <th>Attempts</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d._id}>
                    <td>
                      <code style={{ fontSize: 12 }}>{d.eventType}</code>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {d.eventPublicId}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`tag ${d.status === "succeeded" ? "tag-live" : d.status === "failed" ? "tag-warn" : "tag-draft"}`}
                      >
                        {d.status === "pending" ? `Retrying ${when(d.nextAttemptAt)}` : d.status}
                      </span>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {d.responseStatus ? `HTTP ${d.responseStatus}` : d.error}
                        {d.durationMs != null ? ` · ${d.durationMs} ms` : ""}
                      </div>
                    </td>
                    <td>{d.attempts}</td>
                    <td>{when(d.lastAttemptAt ?? d.createdAt)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          getWebhookDelivery(d._id)
                            .then((r) => setPayload(r.payload))
                            .catch((e) => toast.error(errorText(e)))
                        }
                      >
                        Payload
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === d._id}
                        onClick={() => resend(d)}
                      >
                        Resend
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 20 && (
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="muted">
              Page {page} of {Math.ceil(total / 20)}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page * 20 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
        {payload != null && (
          <pre
            className="card"
            style={{ padding: 12, fontSize: 12, maxHeight: 280, overflow: "auto" }}
          >
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}
