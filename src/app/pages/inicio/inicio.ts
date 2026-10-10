import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Supabase } from '../../core/supabase';
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
  valor: number;
  vagas: number;
  aberto: boolean;
}

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
  private readonly destroyRef = inject(DestroyRef);
  private readonly supabase = inject(Supabase);

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

  /** Valores de reserva, usados até os lotes do admin carregarem (ou se o banco não responder). */
  protected readonly lotes = signal<Lote[]>([
    { numero: 1, valor: 350, vagas: 37, aberto: false },
    { numero: 2, valor: 400, vagas: 37, aberto: false },
    { numero: 3, valor: 450, vagas: 37, aberto: false },
  ]);

  /** Lote aberto no admin; sem nenhum aberto, as inscrições ainda não começaram. */
  protected readonly indiceAberto = computed(() => this.lotes().findIndex((l) => l.aberto));

  /** Fotos da Villa do Galo, em public/local/. */
  protected readonly fotosLocal = [
    { arquivo: 'foto-1.webp', alt: 'Vista aérea da Villa do Galo: campo de futebol, piscina, chalés e o lago ao fundo' },
    { arquivo: 'foto-2.webp', alt: 'Jardim da Villa do Galo com lago e quiosque' },
    { arquivo: 'foto-3.webp', alt: 'Área coberta com mesa de pebolim e mesas de madeira' },
  ];

  protected readonly naoLevar = [
    'Roupas inapropriadas.',
    'Aparelhos eletrônicos desnecessários.',
    'Jogos que não edificam.',
    'Armas de brinquedo ou itens perigosos.',
    'Bebidas alcoólicas ou qualquer tipo de drogas ilícitas.',
  ];

  protected readonly levar = [
    {
      titulo: 'Roupas',
      itens: [
        'Roupas confortáveis e adequadas (lembrando que somos representantes de Cristo).',
        'Roupas para esportes/dinâmicas.',
        'Roupas de frio (pode esfriar à noite).',
        'Roupa de banho (decente/modesta).',
        'Roupa especial para o Culto de Encerramento (estilo social ou camiseta do retiro).',
        'Chinelo e tênis.',
        'Repelente e medicamentos de uso pessoal ⚠️',
        'Roupas de cama: cobertor, travesseiro, etc.',
      ],
    },
    {
      titulo: 'Higiene pessoal',
      itens: ['Sabonete, shampoo, escova de dente, pasta, desodorante, toalha, etc.'],
    },
  ];

  protected readonly regras = [
    'Respeito à liderança e aos colegas.',
    'Respeitar separação por sexo.',
    'Zelar pelo ambiente e pela limpeza.',
    'Horários devem ser respeitados.',
    'Proibido namoro escondido ou entrar no dormitório do sexo oposto.',
    'Ambiente proibido de palavrão, fofoca e bullying.',
    'Este é um tempo para buscar a Deus — desconecte-se das distrações!',
    'Evite demonstrações excessivas de afeto.',
  ];

  protected readonly incluso = [
    'Hospedagem durante os 4 dias',
    'Alimentação completa: café da manhã, almoço e jantar',
    'Dormitórios separados por sexo',
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
      resposta:
        'Pelo site, você paga com Pix ou cartão de crédito ou débito, logo depois de preencher a ficha de inscrição. Para pagar em dinheiro, procure a liderança.',
    },
  ];

  protected readonly links = {
    mapa: 'https://maps.app.goo.gl/Xu1ZP4grwWEaTU6a9',
    instagramLocal: 'https://www.instagram.com/villagalobsb/',
    instagramConectados: 'https://www.instagram.com/conectados_icem/',
    instagramIgreja: 'https://www.instagram.com/emanuelmoriyah/',
    igrejaMapa: 'https://maps.app.goo.gl/tPZR64uJ4TNGmBQ18',
    whatsapp: 'https://wa.me/5561993601769',
  };

  protected readonly menuAberto = signal(false);
  protected readonly secaoAtiva = signal('');
  protected readonly rolou = signal(false);

  protected readonly slideAtual = signal(0);
  protected readonly midias = [
    { tipo: 'video', src: 'img/video-conectados.mp4', alt: '' },
    { tipo: 'foto', src: 'img/galeria-1.jpg', alt: 'Jovens e líderes do Conectados de braços erguidos' },
    { tipo: 'foto', src: 'img/galeria-2.jpg', alt: 'Foto em grupo dos participantes do Conectados' },
  ];
  protected readonly tocando = signal(false);
  protected readonly somLigado = signal(false);
  protected readonly totalSlides = this.midias.length;
  protected readonly slides = Array.from({ length: this.totalSlides }, (_, i) => i);

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
      // Vídeo com som: tenta tocar com som; se o navegador bloquear (ele só permite som depois de
      // uma interação), toca mudo e liga o som no primeiro clique/toque/tecla na página.
      const video = this.host.nativeElement.querySelector<HTMLVideoElement>('.carrossel video');
      if (video) this.tocarComSom(video);

      this.supabase
        .listarLotes()
        .then((todos) => {
          const lotes = todos.filter((l) => l.tipo === 'participante');
          if (lotes.length) this.lotes.set(lotes);
        })
        .catch(() => undefined);

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

  private tocarComSom(video: HTMLVideoElement): void {
    video.muted = false;
    video
      .play()
      .then(() => this.somLigado.set(true))
      .catch(() => {
        video.muted = true;
        video.play().catch(() => undefined); // se nem mudo tocar (economia de dados etc.), fica o ▶
        const eventos = ['pointerdown', 'keydown', 'touchstart'] as const;
        const ligar = (e: Event) => {
          eventos.forEach((n) => document.removeEventListener(n, ligar, true));
          // Clique no próprio botão de som: ele mesmo decide (evita ligar e desligar na hora).
          if ((e.target as HTMLElement)?.closest?.('[data-som]') || !video.muted) return;
          video.muted = false;
          this.somLigado.set(true);
          if (video.paused) video.play().catch(() => undefined);
        };
        eventos.forEach((n) => document.addEventListener(n, ligar, { capture: true, passive: true }));
        this.destroyRef.onDestroy(() => eventos.forEach((n) => document.removeEventListener(n, ligar, true)));
      });
  }

  /** Liga/desliga o som do vídeo. */
  protected alternarSom(video: HTMLVideoElement): void {
    video.muted = !video.muted;
    this.somLigado.set(!video.muted);
    if (!video.muted && video.paused) void video.play();
  }

  protected alternarVideo(video: HTMLVideoElement): void {
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  protected irParaSlide(i: number): void {
    document.querySelectorAll('.carrossel video').forEach((v) => (v as HTMLVideoElement).pause());
    this.slideAtual.set(i);
  }

  protected mudarSlide(passo: number): void {
    document.querySelectorAll('.carrossel video').forEach((v) => (v as HTMLVideoElement).pause());
    this.slideAtual.update((i) => (i + passo + this.totalSlides) % this.totalSlides);
  }

  protected alternarFaq(i: number): void {
    this.faqAberto.update((atual) => (atual === i ? null : i));
  }
}
