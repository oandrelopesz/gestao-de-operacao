// Guia em linguagem simples: o que é cada origem (utm_source) e cada mídia (utm_medium) e quando usar.
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Termo { termo: string; oQue: string; quando: string }

const ORIGENS: Termo[] = [
  { termo: "google", oQue: "O Google: a busca e os anúncios do Google Ads.", quando: "Use para anúncio no Google ou para quem chegou pela busca do Google." },
  { termo: "meta", oQue: "A empresa dona do Facebook e do Instagram.", quando: "Use quando o anúncio roda no gerenciador da Meta e você não quer separar Facebook de Instagram. O gerador já usa a variável da Meta que separa os dois sozinho." },
  { termo: "instagram", oQue: "O Instagram.", quando: "Use para o link da bio, de stories e de posts do Instagram, ou para separar o Instagram do Facebook nos relatórios." },
  { termo: "linkedin", oQue: "O LinkedIn.", quando: "Use para anúncios e publicações no LinkedIn." },
  { termo: "email", oQue: "Um e-mail enviado por você.", quando: "Use em links dentro de e-mails marketing, newsletters e assinaturas." },
  { termo: "sms", oQue: "Uma mensagem de texto no celular.", quando: "Use em links enviados por SMS." },
  { termo: "whatsapp", oQue: "O WhatsApp.", quando: "Use em links divulgados dentro de conversas, listas de transmissão e status do WhatsApp." },
  { termo: "affiliate", oQue: "Um afiliado: alguém que divulga e ganha comissão pela venda.", quando: "Use no link que você entrega para cada afiliado." },
  { termo: "influencer", oQue: "Um influenciador que divulga o cliente.", quando: "Use no link de cada influenciador, assim você vê quem trouxe mais gente." },
  { termo: "referral", oQue: "Indicação: outro site, parceiro ou matéria que colocou o seu link.", quando: "Use quando você combina com um parceiro que ele coloque o seu link no site dele." },
  { termo: "push", oQue: "Notificação que aparece no celular ou no navegador.", quando: "Use em links de notificações push." },
  { termo: "qr", oQue: "Um QR code que a pessoa escaneia com a câmera.", quando: "Use em QR codes de cartão, panfleto, vitrine, embalagem ou evento." },
  { termo: "organic", oQue: "Tráfego orgânico: gente que chegou sem anúncio, por exemplo pela busca.", quando: "Use quando você não sabe de qual plataforma a pessoa veio, mas sabe que não foi anúncio." },
  { termo: "other", oQue: "Qualquer origem que não tem nome na lista.", quando: "Use só quando nenhuma das outras serve. Prefira digitar o nome real em Outro, para o relatório não ficar genérico." },
];

const ORIGENS_DOS_CANAIS: Termo[] = [
  { termo: "youtube", oQue: "O YouTube.", quando: "Anúncios de vídeo do YouTube Ads." },
  { termo: "tiktok", oQue: "O TikTok.", quando: "Anúncios e links do TikTok." },
  { termo: "pinterest", oQue: "O Pinterest.", quando: "Anúncios e pins do Pinterest." },
  { termo: "twitter", oQue: "O X, antigo Twitter.", quando: "Anúncios e posts no X. O GA4 ainda reconhece como twitter." },
  { termo: "taboola", oQue: "Rede de anúncios que aparece no fim de matérias de sites.", quando: "Anúncios da Taboola." },
  { termo: "outbrain", oQue: "Rede parecida com a Taboola, também em matérias.", quando: "Anúncios da Outbrain." },
  { termo: "chatgpt", oQue: "Anúncios dentro do ChatGPT.", quando: "Campanhas de ChatGPT Ads." },
  { termo: "google_meu_negocio", oQue: "A ficha da empresa no Google, a que aparece no mapa.", quando: "Links do perfil do Google Meu Negócio. Fica separado da busca comum do Google." },
];

const MIDIAS: Termo[] = [
  { termo: "cpc", oQue: "Clique pago: você paga cada vez que alguém clica no anúncio.", quando: "Use em anúncios de busca, como Google Ads." },
  { termo: "paid_social", oQue: "Anúncio pago em rede social.", quando: "Use em anúncios do Facebook, Instagram, TikTok, LinkedIn, Pinterest e X." },
  { termo: "social", oQue: "Rede social sem pagar: publicação, bio, stories.", quando: "Use no link da bio e em posts que você mesmo publica." },
  { termo: "organic", oQue: "Tráfego sem pagar que vem de busca.", quando: "Use em links do Google Meu Negócio e em páginas encontradas na busca." },
  { termo: "email", oQue: "E-mail marketing.", quando: "Use em qualquer link dentro de e-mails que você envia." },
  { termo: "newsletter", oQue: "Boletim enviado por e-mail com regularidade.", quando: "Use quando quiser separar a newsletter dos outros e-mails." },
  { termo: "sms", oQue: "Mensagem de texto.", quando: "Use em campanhas por SMS." },
  { termo: "affiliate", oQue: "Link de afiliado, com comissão.", quando: "Use em links de afiliados." },
  { termo: "referral", oQue: "Link colocado em outro site.", quando: "Use em parcerias, matérias e menções em sites de terceiros." },
  { termo: "display", oQue: "Banners e anúncios que aparecem dentro de sites.", quando: "Use em Taboola, Outbrain e em banners do Google Display." },
  { termo: "video", oQue: "Vídeo sem pagar, como um vídeo seu no YouTube.", quando: "Use no link da descrição dos seus vídeos." },
  { termo: "push", oQue: "Notificação no celular ou no navegador.", quando: "Use em campanhas de push." },
  { termo: "offline", oQue: "Material fora da internet: panfleto, cartão, evento.", quando: "Use junto com um QR code ou um link curto impresso." },
  { termo: "cpm", oQue: "Custo por mil impressões: você paga para o anúncio aparecer, não para ser clicado.", quando: "Use em campanhas de alcance e reconhecimento de marca." },
  { termo: "cpv", oQue: "Custo por visualização de vídeo.", quando: "Use em anúncios de vídeo cobrados por visualização, como no YouTube." },
  { termo: "other", oQue: "Qualquer coisa que não se encaixa nas outras.", quando: "Use só se nenhuma outra servir. Prefira digitar um nome claro em Outro." },
];

function Lista({ itens }: { itens: Termo[] }) {
  return (
    <ul className="divide-y">
      {itens.map((t) => (
        <li key={t.termo} className="space-y-0.5 py-2.5">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{t.termo}</code>
          <p className="text-sm">{t.oQue}</p>
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Como usar:</span> {t.quando}</p>
        </li>
      ))}
    </ul>
  );
}

export function AjudaUtm() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-full" title="O que é origem e mídia?" aria-label="Ajuda: origem e mídia">
          <CircleHelp size={18} />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Origem e mídia: o que é cada termo</DialogTitle>
          <DialogDescription>
            A UTM é um carimbo colocado no link. Quando alguém clica, o GA4 lê o carimbo e conta de onde a pessoa veio.
            A <b>origem</b> diz quem trouxe o clique, por exemplo google ou instagram. A <b>mídia</b> diz o tipo de caminho, por exemplo clique pago ou e-mail.
            Exemplo: <code className="text-xs">google / cpc</code> significa clique pago vindo do Google.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="origem" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="self-start">
            <TabsTrigger value="origem">Origem (utm_source)</TabsTrigger>
            <TabsTrigger value="midia">Mídia (utm_medium)</TabsTrigger>
          </TabsList>
          <TabsContent value="origem" className="min-h-0 flex-1 overflow-y-auto pr-1">
            <Lista itens={ORIGENS} />
            <p className="mt-3 border-t pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Usadas pelos canais do gerador</p>
            <Lista itens={ORIGENS_DOS_CANAIS} />
          </TabsContent>
          <TabsContent value="midia" className="min-h-0 flex-1 overflow-y-auto pr-1">
            <Lista itens={MIDIAS} />
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          Dica: escreva sempre em minúsculo e sem espaço. &quot;Google&quot; e &quot;google&quot; viram duas linhas diferentes no relatório. O gerador já faz essa limpeza por você.
        </p>
      </DialogContent>
    </Dialog>
  );
}
