/**
 * Jedyne miejsce importu zod w aplikacji. Zod 4 przy pierwszej walidacji obiektu sprawdza, czy może
 * kompilować walidatory przez `Function("")`. Nasza CSP nie ma 'unsafe-eval', więc taka próba zgłasza
 * naruszenie (securitypolicyviolation). Tryb bez kompilacji jest wolniejszy, ale nasze dane są małe.
 */
import { z } from 'zod';

z.config({ jitless: true });

export { z };
