import { Project } from 'glint-monorepo-test-utils';
import { describe, beforeEach, afterEach, test, expect } from 'vitest';
import { stripIndent } from 'common-tags';

describe('Language Server: Hover', () => {
  let project!: Project;

  beforeEach(async () => {
    project = await Project.create();
  });

  afterEach(async () => {
    await project.destroy();
  });

  test('querying a standalone template', () => {
    project.setGlintConfig({ environment: 'ember-loose' });
    project.write('index.hbs', '<Foo as |foo|>{{foo}}</Foo>');

    let server = project.startLanguageServer();
    let info = server.getHover(project.fileURI('index.hbs'), {
      line: 0,
      character: 17,
    });

    expect(info).toEqual({
      contents: [{ language: 'ts', value: 'const foo: any' }],
      range: {
        start: { line: 0, character: 16 },
        end: { line: 0, character: 19 },
      },
    });
  });

  test('using private properties', () => {
    project.write({
      'index.ts': stripIndent`
        import Component, { hbs } from '@glimmerx/component';

        export default class MyComponent extends Component {
          /** A message. */
          private message = 'hi';

          static template = hbs\`
            {{this.message}}
          \`;
        }
      `,
    });

    let server = project.startLanguageServer();
    let messageInfo = server.getHover(project.fileURI('index.ts'), {
      line: 7,
      character: 12,
    });

    // {{this.message}} in the template matches back to the private property
    expect(messageInfo).toEqual({
      contents: [{ language: 'ts', value: '(property) MyComponent.message: string' }, 'A message.'],
      range: {
        start: { line: 7, character: 11 },
        end: { line: 7, character: 18 },
      },
    });
  });

  test('using args', () => {
    project.write({
      'index.ts': stripIndent`
        import Component, { hbs } from '@glimmerx/component';

        interface MyComponentArgs {
          /** Some string */
          str: string;
        }

        export default class MyComponent extends Component<{ Args: MyComponentArgs }> {
          static template = hbs\`
            {{@str}}
          \`;
        }
      `,
    });

    let server = project.startLanguageServer();
    let strInfo = server.getHover(project.fileURI('index.ts'), {
      line: 9,
      character: 7,
    });

    // {{@str}} in the template matches back to the arg definition
    expect(strInfo).toEqual({
      contents: [
        { language: 'ts', value: '(property) MyComponentArgs.str: string' },
        'Some string',
      ],
      range: {
        start: { line: 9, character: 7 },
        end: { line: 9, character: 10 },
      },
    });
  });

  test('curly block params', () => {
    project.write({
      'index.ts': stripIndent`
        import Component, { hbs } from '@glimmerx/component';

        export default class MyComponent extends Component {
          static template = hbs\`
            {{#each "abc" as |item index|}}
              Item #{{index}}: {{item}}<br>
            {{/each}}
          \`;
        }
      `,
    });

    let server = project.startLanguageServer();
    let indexInfo = server.getHover(project.fileURI('index.ts'), {
      line: 5,
      character: 14,
    });

    // {{index}} in the template matches back to the block param
    expect(indexInfo).toEqual({
      contents: [{ language: 'ts', value: 'const index: number' }],
      range: {
        start: { line: 5, character: 14 },
        end: { line: 5, character: 19 },
      },
    });

    let itemInfo = server.getHover(project.fileURI('index.ts'), {
      line: 5,
      character: 25,
    });

    // {{item}} in the template matches back to the block param
    expect(itemInfo).toEqual({
      contents: [{ language: 'ts', value: 'const item: string' }],
      range: {
        start: { line: 5, character: 25 },
        end: { line: 5, character: 29 },
      },
    });
  });

  test('module details', () => {
    project.write({
      'foo.ts': stripIndent`
        export const foo = 'hi';
      `,
      'index.ts': stripIndent`
        import { foo } from './foo';

        console.log(foo);
      `,
    });

    let server = project.startLanguageServer();
    let info = server.getHover(project.fileURI('index.ts'), {
      line: 0,
      character: 24,
    });

    expect(info).toEqual({
      contents: [{ language: 'ts', value: `module "${project.filePath('foo')}"` }],
      range: {
        start: { line: 0, character: 20 },
        end: { line: 0, character: 27 },
      },
    });
  });

  describe('JS in a TS project', () => {
    test('with allowJs: true', () => {
      let tsconfig = JSON.parse(project.read('tsconfig.json'));
      tsconfig.glint = { environment: 'ember-loose' };
      tsconfig.compilerOptions.allowJs = true;
      project.write('tsconfig.json', JSON.stringify(tsconfig));

      project.write({
        'index.hbs': '{{this.message}}',
        'index.js': stripIndent`
          import Component from '@glimmer/component';

          export default class MyComponent extends Component {
            message = 'hi';
          }
        `,
      });

      let server = project.startLanguageServer();
      let info = server.getHover(project.fileURI('index.hbs'), {
        line: 0,
        character: 10,
      });

      expect(server.getDiagnostics(project.fileURI('index.hbs'))).toEqual([]);
      expect(server.getDiagnostics(project.fileURI('index.js'))).toEqual([]);

      expect(info).toEqual({
        contents: [{ language: 'ts', value: '(property) MyComponent.message: string' }],
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 14 },
        },
      });
    });

    test('allowJs: false', () => {
      let tsconfig = JSON.parse(project.read('tsconfig.json'));
      tsconfig.glint = { environment: 'ember-loose' };
      tsconfig.compilerOptions.allowJs = false;
      project.write('tsconfig.json', JSON.stringify(tsconfig));

      project.write({
        'index.hbs': '{{this.message}}',
        'index.js': stripIndent`
          import Component from '@glimmer/component';

          export default class MyComponent extends Component {
            message = 'hi';
          }
        `,
      });

      let server = project.startLanguageServer();
      let info = server.getHover(project.fileURI('index.hbs'), {
        line: 0,
        character: 10,
      });

      expect(server.getDiagnostics(project.fileURI('index.hbs'))).toEqual([]);
      expect(server.getDiagnostics(project.fileURI('index.js'))).toEqual([]);

      expect(info).toEqual(undefined);
    });
  });
});
