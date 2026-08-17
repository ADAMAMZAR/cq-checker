import { redirect } from "next/navigation";

export default function EditorPage() {
  redirect("/checker?tab=editor");
}
