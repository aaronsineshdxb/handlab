"use client";

import type { Experiment } from "../lib/experiments/types";

/** Lab-manual reader: full write-up of one structured experiment. */
export default function ExperimentViewer({
  experiment,
}: {
  experiment: Experiment;
}) {
  return (
    <article className="exp-viewer" aria-label={experiment.title}>
      <p className="domain-kicker">
        {experiment.kind === "activity" ? "ACTIVITY" : "EXPERIMENT"} · {experiment.topic}
      </p>
      <h2>{experiment.title}</h2>
      <section>
        <h3>Aim</h3>
        <p>{experiment.aim}</p>
      </section>
      {experiment.apparatus.length > 0 && (
        <section>
          <h3>Apparatus</h3>
          <p>{experiment.apparatus.join(", ")}</p>
        </section>
      )}
      <section>
        <h3>Theory</h3>
        <p>{experiment.theory}</p>
        {experiment.formulas.length > 0 && (
          <ul>
            {experiment.formulas.map(({ label, expression }) => (
              <li key={label}>
                {label}: <code>{expression}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>Procedure</h3>
        <ol>
          {experiment.procedure.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>
      {experiment.observationTables.map((table, i) => (
        <section key={i}>
          {table.caption && <h3>{table.caption}</h3>}
          <table>
            <thead>
              <tr>
                {table.columns.map((col) => (
                  <th key={col} scope="col">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{cell || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <section>
        <h3>Result</h3>
        <p>{experiment.result}</p>
      </section>
      {experiment.precautions.length > 0 && (
        <section>
          <h3>Precautions</h3>
          <ul>
            {experiment.precautions.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
