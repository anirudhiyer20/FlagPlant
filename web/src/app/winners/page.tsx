import { redirect } from "next/navigation";

export default function WinnersPage() {
  redirect("/leaderboard?tab=winners");
}
