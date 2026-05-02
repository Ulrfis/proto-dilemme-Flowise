import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export interface IdentityFormProps {
  onSubmit: (identity: { firstName: string; lastName: string }) => Promise<void> | void;
}

export function IdentityForm({ onSubmit }: IdentityFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0;

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ firstName: firstName.trim(), lastName: lastName.trim() });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible d'enregistrer votre nom.",
      );
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handle}
      className="w-full max-w-md mx-auto space-y-5"
      data-testid="form-identity"
    >
      <div className="space-y-2 text-left">
        <Label htmlFor="firstName">Prénom</Label>
        <Input
          id="firstName"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          maxLength={80}
          placeholder="Ex. Marie"
          data-testid="input-first-name"
        />
      </div>

      <div className="space-y-2 text-left">
        <Label htmlFor="lastName">Nom</Label>
        <Input
          id="lastName"
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          maxLength={80}
          placeholder="Ex. Dupont"
          data-testid="input-last-name"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600" data-testid="text-identity-error">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={!canSubmit || submitting}
        className="w-full bg-accent hover:bg-accent/80 text-accent-foreground font-semibold py-4 px-8 rounded-xl transition-all transform hover:scale-105 text-lg"
        data-testid="button-submit-identity"
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Enregistrement…
          </>
        ) : (
          "Démarrer l'aventure !"
        )}
      </Button>
      <p className="text-xs text-gray-500">
        Votre prénom et votre nom sont utilisés pour personnaliser la conversation
        et permettre à votre enseignant·e de relire votre échange.
      </p>
    </form>
  );
}
