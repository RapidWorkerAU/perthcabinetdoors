"use client";

import useIsMobile from "@/hooks/useIsMobile";
import DesignProgram from "./DesignProgram";
import DesignProgramMobile from "./DesignProgramMobile";

/**
 * Chooses the desktop or mobile design shell by viewport width. Both consume
 * the same useDesignProgram hook, so this is purely a layout/interaction fork —
 * the underlying project data and save API are identical.
 */
export default function DesignRoot({ projectId }) {
  const isMobile = useIsMobile();
  return isMobile
    ? <DesignProgramMobile projectId={projectId} />
    : <DesignProgram projectId={projectId} />;
}
