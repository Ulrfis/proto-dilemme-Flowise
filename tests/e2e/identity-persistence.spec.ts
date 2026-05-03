import { test, expect, request } from "@playwright/test";

// Couvre le parcours complet :
//   1. Ouverture de la home → bouton "Démarrer l'aventure"
//   2. Création d'une session anonyme côté serveur (POST /api/sessions)
//   3. Skip de la vidéo via le bouton "j'ai regardé la vidéo" → ajoute le
//      message de bienvenue de Peter (déterministe, persisté via
//      recordMessage("peter", PETER_WELCOME_MESSAGE)).
//   4. Envoi d'un message utilisateur unique → persisté via
//      recordMessage("user", ...).
//   5. Vérification dans la console admin (API + UI) que la session existe
//      et contient bien les deux messages.
//
// Les vérifications "Peter" ne dépendent pas de Flowise : elles s'appuient
// sur le message de bienvenue, qui est déclenché côté client de manière
// déterministe par le clic sur button-watched-video. La réponse Flowise est
// observée best-effort en complément.

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test("parcours session anonyme + persistance des messages côté admin", async ({ page, baseURL }) => {
  test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD manquant — test admin impossible.");

  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const userMessage = `Bonjour Peter, message e2e ${suffix}`;

  // 1) Page d'accueil : on attend le bouton de démarrage et on intercepte la
  //    réponse de POST /api/sessions pour récupérer l'id de session créé.
  await page.goto("/");
  const startBtn = page.getByTestId("button-start-chat");
  await expect(startBtn).toBeVisible();

  const sessionResPromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST",
  );
  await startBtn.click();
  const sessionRes = await sessionResPromise;
  expect(sessionRes.status(), "POST /api/sessions doit renvoyer 2xx").toBeLessThan(300);
  const { id: sessionId } = (await sessionRes.json()) as { id: string };
  expect(sessionId, "POST /api/sessions doit renvoyer un id").toBeTruthy();

  // 2) Skip de la vidéo : on clique sur le bouton "j'ai regardé la vidéo"
  //    porté par le message intro de Peter. Ça déclenche addWelcomeMessage()
  //    qui appelle recordMessage("peter", PETER_WELCOME_MESSAGE) → Peter
  //    persiste de façon déterministe (pas de dépendance à Flowise).
  const watched = page.getByTestId("button-watched-video");
  await expect(watched).toBeVisible({ timeout: 15_000 });
  await watched.click();

  // 3) Envoi d'un message utilisateur unique.
  const chatInput = page.getByTestId("input-chat-message");
  await expect(chatInput).toBeVisible({ timeout: 10_000 });
  await chatInput.fill(userMessage);
  await page.getByTestId("button-send-message").click();

  // Bulle utilisateur dans la conversation.
  const userBubble = page
    .locator('[data-testid^="message-user-"]')
    .filter({ hasText: userMessage });
  await expect(userBubble).toBeVisible({ timeout: 10_000 });

  // 4) Console admin : on s'authentifie via l'API pour récupérer le détail de
  //    la session créée. recordMessage côté client est fire-and-forget : on
  //    poll jusqu'à 30s pour laisser les écritures arriver en base.
  const apiCtx = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${ADMIN_PASSWORD!}` },
  });

  type Detail = {
    session: { id: string; firstName: string | null; createdAt: string };
    messages: Array<{
      sender: "user" | "peter";
      content: string;
      createdAt: string;
    }>;
  };
  let detail: Detail | null = null;
  let hasUser = false;
  let hasPeterWelcome = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = await apiCtx.get(`/api/admin/sessions/${sessionId}`);
    expect(r.ok(), `GET /api/admin/sessions/${sessionId} → ${r.status()}`).toBeTruthy();
    detail = (await r.json()) as Detail;
    hasUser = detail.messages.some(
      (m) => m.sender === "user" && m.content.includes(userMessage),
    );
    hasPeterWelcome = detail.messages.some((m) => m.sender === "peter");
    if (hasUser && hasPeterWelcome) break;
    await page.waitForTimeout(500);
  }

  expect(detail, "détail session introuvable").not.toBeNull();
  expect(detail!.session.id).toBe(sessionId);
  expect(hasUser, `message utilisateur "${userMessage}" non persisté`).toBeTruthy();
  expect(hasPeterWelcome, "aucun message Peter persisté (welcome attendu)").toBeTruthy();

  // Best-effort : on attend (jusqu'à 30 s) une **deuxième** réponse Peter
  // postérieure au message utilisateur — ce serait la réponse Flowise au
  // message envoyé. On ne fait pas échouer le test si Flowise n'est pas
  // joignable, mais on log clairement l'observation.
  const userMsg = detail!.messages.find(
    (m) => m.sender === "user" && m.content.includes(userMessage),
  );
  let peterReplyObserved = false;
  if (userMsg) {
    const userTs = Date.parse(userMsg.createdAt);
    for (let attempt = 0; attempt < 60; attempt++) {
      const r = await apiCtx.get(`/api/admin/sessions/${sessionId}`);
      if (!r.ok()) break;
      const d = (await r.json()) as Detail;
      peterReplyObserved = d.messages.some(
        (m) => m.sender === "peter" && Date.parse(m.createdAt) > userTs,
      );
      if (peterReplyObserved) {
        detail = d;
        break;
      }
      await page.waitForTimeout(500);
    }
  }
  // Volontairement non bloquant : la persistance du welcome + du message
  // utilisateur est le contrat dur, la réponse Flowise est observationnelle.
  console.log(
    `[e2e] réponse Peter postérieure au message utilisateur observée : ${peterReplyObserved}`,
  );

  // 5) Vérification UI de la console admin : login → liste → détail.
  await page.goto("/admin/sessions");
  await page.getByTestId("input-admin-token").fill(ADMIN_PASSWORD!);
  await page.getByTestId("button-admin-login").click();

  // La session peut être paginée loin si la base a beaucoup d'historique :
  // on parcourt les pages jusqu'à trouver la nôtre.
  let row = page.getByTestId(`row-session-${sessionId}`);
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await row.isVisible().catch(() => false)) break;
    const next = page.getByTestId("button-next-page");
    if (!(await next.isEnabled().catch(() => false))) break;
    await next.click();
    await page.waitForTimeout(300);
    row = page.getByTestId(`row-session-${sessionId}`);
  }
  await expect(row, "ligne de session non visible dans la liste admin").toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId(`count-session-${sessionId}`)).toHaveText(/\d+/);

  await page.getByTestId(`link-session-${sessionId}`).click();
  await expect(page).toHaveURL(new RegExp(`/admin/sessions/${sessionId}$`));
  await expect(page.locator('[data-testid^="msg-user-"]').first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator('[data-testid^="msg-peter-"]').first()).toBeVisible();
  await expect(page.getByText(userMessage)).toBeVisible();

  await apiCtx.dispose();
});
