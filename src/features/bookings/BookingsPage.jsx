import { listBookingRows } from "../../services/adminApi.js";
import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";

export function BookingsPage() {
  return (
    <ResourceCrudPage
      title="Bookings"
      hideTitle
      tableName="bookings"
      description="Manage creator bookings, statuses, and links."
      fetchRows={(config, _tableName, options) => listBookingRows(config, options)}
      compactColumns={["mentor_name", "learner_name", "status", "created_at"]}
      columnLabels={{ mentor_name: "Creator", learner_name: "Booked by" }}
      detailFields={[
        { key: "id", label: "Booking ID" },
        { key: "mentor_name", label: "Creator name" },
        { key: "mentor_email", label: "Creator email" },
        { key: "mentor_id", label: "Creator ID" },
        { key: "learner_name", label: "Booked by name" },
        { key: "learner_email", label: "Booked by email" },
        { key: "learner_id", label: "Booked by ID" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created at" },
      ]}
    />
  );
}
