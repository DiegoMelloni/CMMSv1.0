import React from 'react';

const SupportLink = () => {
  return (
    <div className="text-center p-8">
      <h1 className="text-2xl font-bold mb-4">Precisa de Ajuda?</h1>
      
      {/* Botão de Suporte */}
      <a
        href="https://docs.google.com/forms/d/e/1FAIpQLScFkc3KS3W_jnXmQN2ovC7zv6b_Nc0S0Q-ZWfcEQHVNqsz-zg/viewform?usp=sharing&ouid=118431885359139616101"
        target="_blank"
        rel="noopener noreferrer"
        className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors block mx-auto mb-4 w-fit"
      >
        Abrir Formulário de Suporte
      </a>
      
      {/* Novo Botão - Manual do Usuário */}
      <a
        href="https://cmmsv1-0.my.canva.site/manual-cmms"
        target="_blank"
        rel="noopener noreferrer"
        className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 transition-colors block mx-auto w-fit"
      >
        Manual do Usuário
      </a>
      
      <p className="mt-4 text-gray-600">
        Responderemos em até 24 horas úteis.
      </p>
    </div>
  );
};

export default SupportLink;