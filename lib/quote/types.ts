export type QuoteMilestone = {
  id: string;
  deliverable_id: string;
  milestone_title: string | null;
  milestone_description: string | null;
  pricing_unit: string | null;
  estimated_hours: number | null;
  quantity: number | null;
  client_amount_ex_gst: number | null;
};

export type QuotePublicPayload = {
  quote: {
    id: string;
    title: string | null;
    quote_number: string | null;
    status: string | null;
    currency: string | null;
  };
  version: {
    version_number: number;
    subtotal_ex_gst: number | null;
    gst_amount: number | null;
    total_inc_gst: number | null;
    client_notes: string | null;
    assumptions: string | null;
    exclusions: string | null;
    terms: string | null;
  };
  deliverables: Array<{
    id: string;
    deliverable_title: string | null;
    deliverable_description: string | null;
    pricing_mode: string | null;
    total_hours: number | null;
    fixed_price_ex_gst: number | null;
    default_client_rate: number | null;
    subtotal_ex_gst: number | null;
  }>;
  milestones: QuoteMilestone[];
  attachments: Array<{
    id: string;
    file_name: string;
    content_type: string | null;
    file_size: number | null;
    created_at: string;
    public_url: string;
  }>;
  latest_action: {
    action: string | null;
    client_name: string | null;
    created_at: string | null;
    note: string | null;
  } | null;
};
