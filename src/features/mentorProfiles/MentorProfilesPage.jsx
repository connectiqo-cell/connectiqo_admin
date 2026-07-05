import { listMentorProfileRows } from "../../services/adminApi.js";
import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";

export function MentorProfilesPage() {
  return (
    <ResourceCrudPage
      title="Mentor profiles"
      tableName="mentor_profiles"
      description="View and edit mentor-specific rows (rates, bio, category string, etc.)."
      fetchRows={(config, _tableName, options) => listMentorProfileRows(config, options)}
      compactColumns={["name", "email", "category", "price_per_hour", "rating"]}
      detailFields={[
        { key: "id", label: "Profile ID" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "category", label: "Category" },
        { key: "bio", label: "Bio" },
        { key: "price_per_hour", label: "Price / hr" },
        { key: "rating", label: "Rating" },
      ]}
      rowLimit={200}
    />
  );
}
