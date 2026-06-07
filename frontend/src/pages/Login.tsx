import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { useAuth } from "../context/AuthContext";
import { TelaiOSLogo } from "../components/common/TelaiOSLogo";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <Card className="w-full max-w-sm">
        <Card.Content className="p-8">
          <div className="flex items-center justify-center gap-2.5 mb-7">
            <TelaiOSLogo size={36} />
            <span className="text-[22px] font-bold tracking-tight">TelaiOS</span>
          </div>
          <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <TextField
              isRequired
              name="email"
              type="email"
              value={email}
              onChange={setEmail}
            >
              <Label>Email Address</Label>
              <Input autoComplete="email" placeholder="you@example.com" />
              <FieldError />
            </TextField>
            <TextField
              isRequired
              name="password"
              type="password"
              value={password}
              onChange={setPassword}
              isInvalid={!!error}
            >
              <Label>Password</Label>
              <Input autoComplete="current-password" placeholder="••••••••" />
              {error && <FieldError>{error}</FieldError>}
            </TextField>
            <Button type="submit" isPending={loading} fullWidth>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </Form>
        </Card.Content>
      </Card>
    </main>
  );
}
