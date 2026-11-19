export function EmBreve({ titulo, marco, texto }: { titulo: string; marco: string; texto: string }) {
  return (
    <section>
      <h1 class="titulo-tela">{titulo}</h1>
      <div class="cartao">
        <p class="selo">Chega no marco {marco}</p>
        <p>{texto}</p>
      </div>
    </section>
  );
}
