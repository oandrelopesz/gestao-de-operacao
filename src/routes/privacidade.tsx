import { createFileRoute } from "@tanstack/react-router";

// Página pública exigida pelo Google para o app de login (OAuth) ficar "Em produção" como externo.
export const Route = createFileRoute("/privacidade")({
  head: () => ({ meta: [{ title: "Política de Privacidade | Gestão de Operação" }] }),
  component: Privacidade,
});

function Privacidade() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-foreground space-y-5">
      <h1 className="text-2xl font-bold">Política de Privacidade: Gestão de Operação</h1>
      <p className="text-muted-foreground">Atualizada em 7 de outubro de 2026.</p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Quem somos</h2>
        <p>
          O Gestão de Operação é o sistema interno de André Lopes, usado apenas pela própria operação de marketing
          digital. Contato: <a className="text-primary underline" href="mailto:contato@andrelopes.digital">contato@andrelopes.digital</a>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Dados do Google que o sistema acessa</h2>
        <p>Somente com a sua autorização, na tela de consentimento do Google:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Google Drive: leitura dos arquivos escolhidos e dos arquivos criados pelo próprio sistema.</li>
          <li>Google Agenda: eventos e lista de agendas.</li>
          <li>Perfil da Empresa no Google: gerenciar os perfis e publicar posts dos clientes atendidos.</li>
          <li>Nome e e-mail da conta Google, para o login.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Como os dados são usados</h2>
        <p>
          Os dados são usados apenas para as funções do sistema (arquivos, agenda e posts nos perfis). Nada é vendido,
          compartilhado com terceiros ou usado para anúncios. O uso das informações recebidas das APIs do Google segue a{" "}
          <a className="text-primary underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , incluindo os requisitos de Uso Limitado.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Onde os dados ficam</h2>
        <p>
          No banco de dados do sistema (Supabase) e, no caso de arquivos, no Cloudflare R2, com acesso restrito ao
          responsável pelo sistema.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Como revogar o acesso</h2>
        <p>
          A qualquer momento em{" "}
          <a className="text-primary underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            myaccount.google.com/permissions
          </a>
          , ou pedindo a exclusão dos dados pelo e-mail acima.
        </p>
      </section>
    </main>
  );
}
