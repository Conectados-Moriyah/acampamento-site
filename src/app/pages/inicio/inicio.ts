import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';

interface Lote {
  numero: number;
  normal: { valor: number; vagas: number };
  lider: { valor: number; vagas: number };
}

interface DiaProgramacao {
  dia: string;
  data: string;
  itens: { hora: string; titulo: string; descricao: string }[];
}

type TipoInscricao = 'normal' | 'lider';

/** Início do acampamento: saída da igreja, 6 de fevereiro às 10h (horário de Brasília). */
const INICIO_EVENTO = new Date('2027-02-06T10:00:00-03:00').getTime();

@Component({
  imports: [CurrencyPipe, RouterLink],
  selector: 'app-inicio',
  styleUrl: './inicio.scss',
  templateUrl: './inicio.html',
})
export class Inicio {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly menu = [
    { id: 'onde', label: 'Onde?' },
    { id: 'quando', label: 'Quando?' },
    { id: 'duvidas', label: 'FAQ' },
  ];

  protected readonly faixa = [
    'Palavra',
    'Louvor',
    'Gincanas',
    'Comunhão',
    'Programação',
    '6 a 9 de fevereiro',
  ];

  protected readonly pilares = [
    { num: '01', titulo: 'Palavras impactantes', texto: 'Ministrações que falam direto ao coração da juventude.' },
    { num: '02', titulo: 'Louvor', texto: 'Momentos de adoração que conectam céu e terra.' },
    { num: '03', titulo: 'Gincanas & esportes', texto: 'Competições, desafios e muita diversão em equipe.' },
    { num: '04', titulo: 'Comunhão', texto: 'Novas amizades e laços que continuam depois do acampamento.' },
  ];

  protected readonly lotes: Lote[] = [
    { numero: 1, normal: { valor: 350, vagas: 37 }, lider: { valor: 250, vagas: 20 } },
    { numero: 2, normal: { valor: 400, vagas: 37 }, lider: { valor: 280, vagas: 10 } },
    { numero: 3, normal: { valor: 450, vagas: 37 }, lider: { valor: 310, vagas: 10 } },
  ];

  protected readonly programacao: DiaProgramacao[] = [
    {
      dia: 'Sábado',
      data: '06/02',
      itens: [
        { hora: '10h', titulo: 'Saída da igreja', descricao: 'Encontro no estacionamento e embarque nos ônibus.' },
        { hora: 'Tarde', titulo: 'Chegada e acomodação', descricao: 'Check-in, divisão dos quartos e boas-vindas.' },
        { hora: 'Noite', titulo: 'Culto de abertura', descricao: 'Louvor e palavra para começar com tudo.' },
      ],
    },
    {
      dia: 'Domingo',
      data: '07/02',
      itens: [
        { hora: 'Manhã', titulo: 'Devocional e café', descricao: 'Começando o dia na presença de Deus.' },
        { hora: 'Tarde', titulo: 'Gincanas', descricao: 'Equipes, provas e muita disputa saudável.' },
        { hora: 'Noite', titulo: 'Culto', descricao: 'Ministração e tempo de adoração.' },
      ],
    },
    {
      dia: 'Segunda',
      data: '08/02',
      itens: [
        { hora: 'Manhã', titulo: 'Oficinas', descricao: 'Grupos de conversa e estudo bíblico.' },
        { hora: 'Tarde', titulo: 'Esportes e lazer', descricao: 'Piscina, futebol, vôlei e tempo livre.' },
        { hora: 'Noite', titulo: 'Noite de louvor', descricao: 'Um culto especial de celebração.' },
      ],
    },
    {
      dia: 'Terça',
      data: '09/02',
      itens: [
        { hora: 'Manhã', titulo: 'Culto de encerramento', descricao: 'Envio e oração pela juventude.' },
        { hora: 'Tarde', titulo: 'Retorno', descricao: 'Embarque de volta para a igreja.' },
        { hora: '18h', titulo: 'Chegada à igreja', descricao: 'Previsão de chegada. Os pais podem buscar no local.' },
      ],
    },
  ];

  protected readonly incluso = [
    'Hospedagem durante os 4 dias',
    'Alimentação completa',
    'Transporte de ida e volta',
    'Acesso a todas as atividades, cultos e gincanas',
    'Kit do acampante',
  ];

  protected readonly faq = [
    {
      pergunta: 'O que levar na mala?',
      resposta:
        'Bíblia, caderno e caneta, roupas para 4 dias, roupa de banho, toalha, itens de higiene, protetor solar, repelente, roupa de cama e travesseiro.',
    },
    {
      pergunta: 'Menores de idade podem ir?',
      resposta:
        'Sim. A idade mínima é 12 anos e menores de 18 precisam entregar o termo de autorização assinado pelo responsável. Menores de 12 anos só participam acompanhados pelos pais ou por um responsável maior de 18 anos.',
    },
    {
      pergunta: 'Como funciona a alimentação?',
      resposta:
        'Todas as refeições estão incluídas no valor da inscrição. Se você tem alguma restrição alimentar, informe na ficha de inscrição.',
    },
    {
      pergunta: 'Quais são as formas de pagamento?',
      resposta: 'As formas de pagamento serão divulgadas quando as inscrições forem abertas.',
    },
    {
      pergunta: 'Qual a diferença entre participante e líder?',
      resposta:
        'A inscrição de líder é destinada a quem serve na organização e cuidado dos jovens durante o acampamento, com valor e número de vagas próprios.',
    },
  ];

  // TODO: falta o número do WhatsApp.
  protected readonly links = {
    mapa: 'https://maps.app.goo.gl/Xu1ZP4grwWEaTU6a9',
    instagramLocal: 'https://www.instagram.com/villagalobsb/',
    instagramConectados: 'https://www.instagram.com/conectados_icem/',
    instagramIgreja: 'https://www.instagram.com/emanuelmoriyah/',
    igrejaMapa: 'https://maps.app.goo.gl/tPZR64uJ4TNGmBQ18',
    whatsapp: 'https://wa.me/',
  };

  protected readonly menuAberto = signal(false);
  protected readonly secaoAtiva = signal('');
  protected readonly rolou = signal(false);

  protected readonly slideAtual = signal(0);
  protected readonly totalSlides = 4;
  protected readonly slides = Array.from({ length: this.totalSlides }, (_, i) => i);

  protected readonly diaAtivo = signal(0);
  protected readonly tipoInscricao = signal<TipoInscricao>('normal');
  protected readonly faqAberto = signal<number | null>(0);

  private readonly agora = signal(Date.now());
  protected readonly contagem = computed(() => {
    const restante = Math.max(0, INICIO_EVENTO - this.agora());
    const s = Math.floor(restante / 1000);
    return [
      { valor: Math.floor(s / 86400), rotulo: 'Dias' },
      { valor: Math.floor((s % 86400) / 3600), rotulo: 'Horas' },
      { valor: Math.floor((s % 3600) / 60), rotulo: 'Min' },
      { valor: s % 60, rotulo: 'Seg' },
    ];
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Tudo que depende de window/IntersectionObserver roda só no navegador (o site é pré-renderizado).
    afterNextRender(() => {
      const timer = setInterval(() => this.agora.set(Date.now()), 1000);

      const raiz = this.host.nativeElement;
      const revelar = new IntersectionObserver(
        (entradas) =>
          entradas.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('visivel');
              revelar.unobserve(e.target);
            }
          }),
        { threshold: 0.12 },
      );
      raiz.querySelectorAll('.revelar').forEach((el) => revelar.observe(el));

      const espiao = new IntersectionObserver(
        (entradas) =>
          entradas.forEach((e) => e.isIntersecting && this.secaoAtiva.set(e.target.id)),
        { rootMargin: '-45% 0px -50% 0px' },
      );
      raiz.querySelectorAll('section[id]').forEach((el) => espiao.observe(el));

      const aoRolar = () => this.rolou.set(window.scrollY > 24);
      aoRolar();
      window.addEventListener('scroll', aoRolar, { passive: true });

      destroyRef.onDestroy(() => {
        clearInterval(timer);
        revelar.disconnect();
        espiao.disconnect();
        window.removeEventListener('scroll', aoRolar);
      });
    });
  }

  protected alternarMenu(): void {
    this.menuAberto.update((v) => !v);
  }

  protected fecharMenu(): void {
    this.menuAberto.set(false);
  }

  protected mudarSlide(passo: number): void {
    this.slideAtual.update((i) => (i + passo + this.totalSlides) % this.totalSlides);
  }

  protected alternarFaq(i: number): void {
    this.faqAberto.update((atual) => (atual === i ? null : i));
  }
}
