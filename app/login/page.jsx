import { redirect } from "next/navigation";

// Consolidated: the canonical login lives at /classroom/login
export default function LoginRedirect() {
  redirect("/classroom/login");
}
