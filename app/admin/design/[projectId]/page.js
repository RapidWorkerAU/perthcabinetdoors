import { requireAdminSession } from "../../../../lib/admin-guard";
import DesignProgram from "../_components/DesignProgram";

export const metadata = { title: "Design Tool — PCD Admin" };

export default async function DesignProjectPage({ params }) {
  await requireAdminSession();
  const { projectId } = await Promise.resolve(params);
  return <DesignProgram projectId={projectId} />;
}
