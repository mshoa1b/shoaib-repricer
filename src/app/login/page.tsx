"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // For simplicity, hardcoded simple password as requested. 
    // In production, use next-auth or a proper session.
    if (password === "admin123") {
      document.cookie = "auth=true; path=/";
      router.push("/dashboard");
    } else {
      setError("Invalid password");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: '60vh' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        <h1 className="mb-2">Welcome Back</h1>
        <p className="text-secondary mb-8">Enter your password to access the ecosystem.</p>
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="input-group">
            <input 
              type="password" 
              className="input-field" 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && <div style={{ color: 'var(--accent-danger)', fontSize: '0.875rem' }}>{error}</div>}
          <button type="submit" className="btn btn-primary w-full">Login</button>
        </form>
      </div>
    </div>
  );
}
