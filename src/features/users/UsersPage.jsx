import { useNavigate } from "react-router-dom";
import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";
import { TABLE_SEARCH_COLUMNS } from "../../services/adminApi.js";

export function UsersPage() {
  const navigate = useNavigate();

  return (
    <ResourceCrudPage
      title="Profiles"
      tableName="profiles"
      hideTitle
      description="Browse users, open a profile for media and moderation, freeze creator access, or ban login."
      compactColumns={["name", "email", "is_frozen", "created_at"]}
      columnLabels={{
        name: "Name",
        email: "Email",
        is_frozen: "Login",
        created_at: "Joined",
      }}
      searchColumns={TABLE_SEARCH_COLUMNS.profiles.text}
      detailFields={[
        { key: "id", label: "ID" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "is_frozen", label: "Login" },
        { key: "avatar_url", label: "Avatar URL" },
        { key: "created_at", label: "Joined" },
      ]}
      enableMentorFreeze
      enableProfileFreeze
      onViewRow={(row) => navigate(`/users/${row.id}`)}
    />
  );
}
