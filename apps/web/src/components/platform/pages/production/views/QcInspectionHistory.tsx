import { resolveMediaUrl } from "@/lib/mediaUrl";
import { QC_CHECKS, type QcInspection } from "@/services/production-qc";
export function QcInspectionHistory({ inspections }: { inspections: QcInspection[] }) {
  if (!inspections.length) return <p className="muted">No QC inspections recorded.</p>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {[...inspections].reverse().map((inspection) => (
        <details key={inspection._id} className="card" style={{ padding: 12 }}>
          <summary style={{ cursor: "pointer" }}>
            <strong>{inspection.passed ? "Passed" : "Failed"}</strong>
            {" ? "}
            {new Date(inspection.at).toLocaleString("en-IN")}
            {" ? "}
            {inspection.inspectorName || "Inspector " + inspection.inspectorUserId}
          </summary>
          <p>
            {inspection.inspectedQuantity} / {inspection.expectedQuantity} units inspected;{" "}
            {inspection.failedQuantity} failed.
          </p>
          {inspection.reason && (
            <p>
              <strong>Failure reason:</strong> {inspection.reason}
            </p>
          )}
          {inspection.notes && <p>{inspection.notes}</p>}
          <ul>
            {QC_CHECKS.map(({ key, label }) => (
              <li key={key}>
                {inspection.checks[key] ? "Checked" : "Not confirmed"}: {label}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {inspection.photoUrls.map((url, index) => (
              <a key={url} href={resolveMediaUrl(url)} target="_blank" rel="noreferrer">
                <img
                  src={resolveMediaUrl(url)}
                  alt={"QC evidence " + (index + 1)}
                  loading="lazy"
                  style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 8 }}
                />
              </a>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
