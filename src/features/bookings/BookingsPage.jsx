import { listBookingRows } from "../../services/adminApi.js";
import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";

export function BookingsPage() {
  return (
    <ResourceCrudPage
      title="Bookings Management"
      tableName="bookings"
      description="Manage mentor-learner bookings, statuses, and links."
      fetchRows={(config, _tableName, options) => listBookingRows(config, options)}
      compactColumns={["mentor_name", "learner_name", "status", "created_at"]}
      detailFields={[
        { key: "id", label: "Booking ID" },
        { key: "mentor_name", label: "Mentor name" },
        { key: "mentor_email", label: "Mentor email" },
        { key: "mentor_id", label: "Mentor ID" },
        { key: "learner_name", label: "Learner name" },
        { key: "learner_email", label: "Learner email" },
        { key: "learner_id", label: "Learner ID" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created at" },
      ]}
    />
  );
}
