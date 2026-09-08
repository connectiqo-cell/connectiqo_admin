import { useNavigate } from "react-router-dom";
import { ResourceCrudPage } from "../resources/ResourceCrudPage.jsx";

export function UsersPage() {
  const navigate = useNavigate();

  return (
    <ResourceCrudPage
      title="Profiles"
      tableName="profiles"
      description="Browse users, open a profile for media and moderation, freeze mentor access, or ban login."
      compactColumns={["name", "email", "is_frozen", "created_at"]}
      columnLabels={{
        name: "Name",
        email: "Email",
        is_frozen: "Login banned",
        created_at: "Joined",
      }}
      detailFields={[
        { key: "id", label: "ID" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "is_frozen", label: "Login banned" },
        { key: "avatar_url", label: "Avatar URL" },
        { key: "created_at", label: "Created At" },
      ]}
      enableMentorFreeze
      enableProfileFreeze
      onViewRow={(row) => navigate(`/users/${row.id}`)}
    />
  );
}
