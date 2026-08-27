import WorkShell from '../work-management/WorkShell'
import { requireAdminSession } from '../../../lib/admin-guard'
import { createSupabaseAdminClient } from '../../../lib/supabase/admin'
import { loadBoard } from '../../../lib/pcd-board-load'
import BoardClient from './BoardClient'

export const dynamic = 'force-dynamic'

// The board is the whole list, grouped. The dashboard is the top of the same
// list, ranked. Both read lib/pcd-board-load.ts, so a card set aside here is
// gone from both, and neither can quietly disagree with the other about what
// still needs doing.

export default async function AdminBoardPage() {
  await requireAdminSession()

  const { cards, setAsideCount, failed, today } = await loadBoard(createSupabaseAdminClient())

  return (
    <WorkShell>
      <BoardClient
        cards={cards}
        setAsideCount={setAsideCount}
        failed={failed}
        today={today}
        loadedAt={new Date().toISOString()}
      />
    </WorkShell>
  )
}
