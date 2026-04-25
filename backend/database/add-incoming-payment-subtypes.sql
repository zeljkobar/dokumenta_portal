ALTER TABLE documents
  MODIFY document_subtype ENUM(
    'virman',
    'gotovina',
    'kartica',
    'racun',
    'ugovor',
    'potvrda',
    'licna_karta',
    'pasos',
    'ostalo'
  ) NOT NULL;
