import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";
import { TABLE_SEARCH_COLUMNS } from "../../services/adminApi.js";

export function UsersPage() {
  return (
    <ResourceCrudPage
      title="Profiles"
      hideTitle
      tableName="profiles"
      description="View, edit, update, or delete user profiles. Freeze blocks sign-in for that account in the mobile app."
      compactColumns={["name", "email", { key: "role", kind: "status" }, "is_frozen", "created_at"]}
      searchColumns={TABLE_SEARCH_COLUMNS.profiles.text}
      detailFields={[
        { key: "id", label: "ID" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "role", label: "Role" },
        { key: "is_frozen", label: "Frozen" },
        { key: "avatar_url", label: "Avatar URL" },
        { key: "created_at", label: "Created At" },
      ]}
      enableProfileFreeze
    />
  );
}
