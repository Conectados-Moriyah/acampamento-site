import { CurrencyPipe } from '@angular/common';
import { Component } from '@angular/core';

interface Lote {
  numero: number;
  normal: { valor: number; vagas: number };
  lider: { valor: number; vagas: number };
}

@Component({
  imports: [CurrencyPipe],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly lotes: Lote[] = [
    { numero: 1, normal: { valor: 350, vagas: 37 }, lider: { valor: 250, vagas: 20 } },
    { numero: 2, normal: { valor: 400, vagas: 37 }, lider: { valor: 280, vagas: 10 } },
    { numero: 3, normal: { valor: 450, vagas: 37 }, lider: { valor: 310, vagas: 10 } },
  ];
}
