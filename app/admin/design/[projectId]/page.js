import { requireAdminSession } from "../../../../lib/admin-guard";
import DesignRoot from "../_components/DesignRoot";

export const metadata = { title: "Design Tool — PCD Admin" };

export default async function DesignProjectPage({ params }) {
  await requireAdminSession();
  const { projectId } = await Promise.resolve(params);
  return <DesignRoot projectId={projectId} />;
}
