import { Activity, Search } from "lucide-react"
import type { AdminAuditEvent } from "../lib/swiftpay"

type AuditAdminSectionProps = {
  events: AdminAuditEvent[]
  totalEvents: number
  search: string
  onSearchChange: (value: string) => void
}

export default function AuditAdminSection({
  events,
  totalEvents,
  search,
  onSearchChange,
}: AuditAdminSectionProps) {
  return (
    <section className="admin-card">
      <div className="admin-card-heading">
        <span className="setting-icon">
          <Activity size={19} />
        </span>
        <div>
          <h2>Recorded team activity</h2>
          <p>
            Balance adjustments, transfer reviews, and the latest KYB review per
            application. Showing up to 500 events.
          </p>
        </div>
      </div>
      <div className="admin-list-controls">
        <label className="admin-search">
          <Search size={16} />
          <input
            aria-label="Search audit history"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search action, merchant, team member, or details"
          />
        </label>
        <small>
          {events.length} of {totalEvents}
        </small>
      </div>
      {events.length === 0 ? (
        <p className="admin-empty">
          {totalEvents
            ? "No audit events match your search."
            : "No recorded team activity is available yet."}
        </p>
      ) : (
        <div className="admin-audit-list">
          {events.map((event) => (
            <article
              className="admin-audit-event"
              key={`${event.category}-${event.id}`}
            >
              <span className="setting-icon">
                <Activity size={16} />
              </span>
              <div>
                <div className="admin-audit-heading">
                  <strong>{event.action}</strong>
                  <small>{new Date(event.occurredAt).toLocaleString()}</small>
                </div>
                <p>{event.summary}</p>
                <small>
                  {event.category} · {event.target} · By{" "}
                  {event.actor || "DRPAY team"}
                </small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
