# Modelo simples de 12 meses — todas as entradas são suposições explícitas
PRECO_M, PRECO_A = 9.90, 79.90
APPLE = 0.15          # 10% comissão (Small Business) + 5% processamento IAP (Brasil, jun/2026)
IOF = 0.035           # cenário conservador: supõe que o IOF sai da receita
IMPOSTO = 0.06        # Simples Nacional, faixa inicial (estimativa)
f = (1-APPLE)*(1-IOF)*(1-IMPOSTO)
net_m = PRECO_M*f; net_a = PRECO_A*f
print(f"fator liquido {f:.3f}  mensal liq R$ {net_m:.2f}  anual liq R$ {net_a:.2f} (R$ {net_a/12:.2f}/mes)")
cen = {
 "pessimista": dict(inst=150, conv=0.005, anual=0.5, churn=0.15, custo=200),
 "realista":   dict(inst=800, conv=0.015, anual=0.6, churn=0.10, custo=200),
 "otimista":   dict(inst=4000,conv=0.03,  anual=0.7, churn=0.07, custo=600),
}
for nome,c in cen.items():
    subs_m=0.0; subs_a=0.0; caixa=0; mrr_list=[]
    for mes in range(1,13):
        novos = c["inst"]*c["conv"]
        subs_m = subs_m*(1-c["churn"]) + novos*(1-c["anual"])
        subs_a += novos*c["anual"]
        caixa_mes = subs_m*net_m + novos*c["anual"]*net_a
        caixa += caixa_mes
        mrr = subs_m*net_m + subs_a*net_a/12
        mrr_list.append(mrr)
    lucro = caixa - 12*c["custo"]
    print(f"{nome}: instalações/ano {c['inst']*12}, assinantes mes12 {subs_m+subs_a:.0f} (mensais {subs_m:.0f}, anuais {subs_a:.0f}), "
          f"receita liquida recorrente mes12 R$ {mrr_list[-1]:.0f}/mes, caixa liquido 12m R$ {caixa:.0f}, custo caixa 12m R$ {12*c['custo']}, saldo R$ {lucro:.0f}")
# break-even
for mix in (0.6,):
    arpu = mix*net_a/12 + (1-mix)*net_m
    print(f"ARPU liquido misto (60% anual) R$ {arpu:.2f}/mes")
    for custo in (80,200,600,200+1250):
        print(f"  custo R$ {custo}/mes -> {custo/arpu:.0f} assinantes")
