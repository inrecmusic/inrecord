import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { sortAnnouncements } from "@/lib/announcements-view";

export async function GET(req) {
  const g = await requireClassroomAuth(req);
  if (g.res) return g.res;
  const { supabase } = g;

  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, pinned, important, published, created_at")
    .eq("published", true);
  if (error) return serverError(error);

  const sorted = sortAnnouncements(data || []).map(({ id, title, body, pinned, important, created_at }) => ({ id, title, body, pinned, important: !!important, created_at }));
  return NextResponse.json({ announcements: sorted });
}
