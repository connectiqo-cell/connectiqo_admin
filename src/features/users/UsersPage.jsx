import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";

export function UsersPage() {
  return (
    <ResourceCrudPage
      title="Profiles"
      tableName="profiles"
      description="View, edit, update, or delete user profiles. Freeze blocks sign-in for that account in the mobile app."
      compactColumns={["name", "email", "role", "is_frozen"]}
      searchColumns={["name", "email"]}
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
      rowLimit={400}
    />
  );
}
