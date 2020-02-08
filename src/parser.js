const chevrotain = require('chevrotain');
const lexer = require('./lexer');

const { EmbeddedActionsParser, EOF, tokenMatcher } = chevrotain;
const { Tokens, tokenList, AbstractTokens } = lexer;

const ENABLE_SEMICOLON_INSERTION = true;
const DISABLE_SEMICOLON_INSERTION = false;

const t = Tokens;

// Parser LL(2)
class UlaParser extends EmbeddedActionsParser {
  constructor() {
    super(tokenList, {
      maxLookahead: 2,
    });

    // Optimization to avoid traversing the prototype chain at hotspots.
    this.SUPER_CONSUME = super.CONSUME;
    this.SUPER_CONSUME2 = super.CONSUME2;

    // eslint-disable-next-line no-underscore-dangle
    this._orgText = '';

    // to avoid V8 hidden class changes by dynamic definition
    // of properties on "this"
    this.c1 = undefined;
    this.c2 = undefined;
    this.c3 = undefined;
    this.c4 = undefined;
    this.c5 = undefined;

    const $ = this;

    // See 11.1
    $.RULE('PrimaryExpression', () => {
      $.OR(
        $.c5
          || ($.c5 = [
            { ALT: () => $.CONSUME(t.Identificador) },
            { ALT: () => $.SUBRULE($.ArrayLiteral) },
            { ALT: () => $.SUBRULE($.ObjectLiteral) },
            { ALT: () => $.SUBRULE($.ParenthesisExpression) },
          ]),
      );
    });

    $.RULE('ParenthesisExpression', () => {
      $.CONSUME(t.ParentesisIzquierdo);
      $.SUBRULE($.Expression);
      $.CONSUME(t.ParentesisDerecho);
    });

    // See 11.1.4
    $.RULE('ArrayLiteral', () => {
      $.CONSUME(t.CorcheteIzquierdo);
      $.MANY(() => {
        $.OR([
          // TODO: fix ambiguities with Comas
          // TODO2: WHICH AMBIGUITIES?! :)
          { ALT: () => $.SUBRULE($.ElementList) },
          { ALT: () => $.SUBRULE($.Elision) },
        ]);
      });
      $.CONSUME(t.CorcheteDerecho);
    });

    // See 11.1.4
    $.RULE('ElementList', () => {
      // in the spec this may start with an optional Elision,
      // this create an ambiguity in the ArrayLiteral rule.
      // removing the Elision from this here does not modify the grammar
      // as the ElementList rule is only invoked from ArrayLiteral rule
      $.SUBRULE($.AssignmentExpression);
      $.MANY(() => {
        $.SUBRULE2($.Elision);
        $.SUBRULE2($.AssignmentExpression);
      });
    });

    // See 11.1.4
    $.RULE('Elision', () => {
      $.AT_LEAST_ONE(() => {
        $.CONSUME(t.Coma);
      });
    });

    // See 11.1.5
    // this inlines PropertyNameAndValueList
    $.RULE('ObjectLiteral', () => {
      $.CONSUME(t.LlaveIzquierda);
      $.OPTION(() => {
        $.SUBRULE($.PropertyAssignment);
        $.MANY(() => {
          $.CONSUME(t.Coma);
          $.SUBRULE2($.PropertyAssignment);
        });
        $.OPTION2(() => {
          $.CONSUME2(t.Coma);
        });
      });
      $.CONSUME(t.LlaveIzquierda);
    });

    // See 11.1.5
    $.RULE('PropertyAssignment', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.RegularPropertyAssignment) },
      ]);
    });

    $.RULE('RegularPropertyAssignment', () => {
      $.SUBRULE($.PropertyName);
      $.CONSUME(t.DosPuntos);
      $.SUBRULE($.AssignmentExpression);
    });

    // See 11.1.5
    // this inlines PropertySetParameterList
    $.RULE('PropertyName', () => {
      $.OR([
        { ALT: () => $.CONSUME(t.Identificador) },
        { ALT: () => $.CONSUME(t.CadenaCaracteres) },
        { ALT: () => $.CONSUME(t.Entero) },
      ]);
    });

    // See 11.2
    // merging MemberExpression, NewExpression and CallExpression into one rule
    $.RULE('MemberCallNewExpression', () => {
      $.MANY(() => {
        $.CONSUME(t.Nuevo);
      });

      $.OR([
        { ALT: () => $.SUBRULE($.PrimaryExpression) },
        { ALT: () => $.SUBRULE($.FunctionExpression) },
      ]);

      $.MANY2(() => {
        $.OR2([
          { ALT: () => $.SUBRULE($.BoxMemberExpression) },
          { ALT: () => $.SUBRULE($.DotMemberExpression) },
          { ALT: () => $.SUBRULE($.Arguments) },
        ]);
      });
    });

    $.RULE('BoxMemberExpression', () => {
      $.CONSUME(t.CorcheteIzquierdo);
      $.SUBRULE($.Expression);
      $.CONSUME(t.CorcheteDerecho);
    });

    $.RULE('DotMemberExpression', () => {
      $.CONSUME(t.Punto);
      $.CONSUME(t.Identificador);
    });

    // See 11.2
    // this inlines ArgumentList
    $.RULE('Arguments', () => {
      $.CONSUME(t.ParentesisIzquierdo);
      $.OPTION(() => {
        $.SUBRULE($.AssignmentExpression);
        $.MANY(() => {
          $.CONSUME(t.Coma);
          $.SUBRULE2($.AssignmentExpression);
        });
      });
      $.CONSUME(t.ParentesisDerecho);
    });

    // See 11.3
    $.RULE('PostfixExpression', () => {
      // LHSExpression(see 11.2) is identical to MemberCallNewExpression
      $.SUBRULE($.MemberCallNewExpression);
      $.OPTION({
        GATE: this.noLineTerminatorHere,
        DEF: () => {
          $.OR([
            { ALT: () => $.CONSUME(t.MasMas) },
            { ALT: () => $.CONSUME(t.MenosMenos) },
          ]);
        },
      });
    });

    // See 11.4
    $.RULE('UnaryExpression', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.PostfixExpression) },
        {
          ALT: () => {
            $.OR2(
              $.c1
                || ($.c1 = [
                  { ALT: () => $.CONSUME(t.MasMas) },
                  { ALT: () => $.CONSUME(t.MenosMenos) },
                  { ALT: () => $.CONSUME(t.Suma) },
                  { ALT: () => $.CONSUME(t.Resta) },
                  { ALT: () => $.CONSUME(t.Exclamacion) },
                ]),
            );
            $.SUBRULE($.UnaryExpression);
          },
        },
      ]);
    });

    $.RULE('BinaryExpression', () => {
      $.SUBRULE($.UnaryExpression);
      $.MANY(() => {
        $.OR(
          $.c3
            || ($.c3 = [
              // flat list of binary operators
              { ALT: () => $.CONSUME(t.BarraBarra) },
              { ALT: () => $.CONSUME(t.AmpersandAmpersand) },
              { ALT: () => $.CONSUME(AbstractTokens.OperadorLogico) },
              {
                ALT: () => $.CONSUME(AbstractTokens.OperadorMultiplicacion),
              },
              { ALT: () => $.CONSUME(AbstractTokens.OperadorMultiplicacion) },
            ]),
        );
        $.SUBRULE2($.UnaryExpression);
      });
    });

    $.RULE('BinaryExpressionNoIn', () => {
      $.SUBRULE($.UnaryExpression);
      $.MANY(() => {
        $.OR(
          $.c4
            || ($.c4 = [
              // flat list of binary operators
              { ALT: () => $.CONSUME(t.BarraBarra) },
              { ALT: () => $.CONSUME(t.AmpersandAmpersand) },
              { ALT: () => $.CONSUME(AbstractTokens.OperadorLogico) },
              {
                ALT: () => $.CONSUME(AbstractTokens.OperadorMultiplicacion),
              },
              { ALT: () => $.CONSUME(AbstractTokens.OperadorMultiplicacion) },
            ]),
        );
        $.SUBRULE2($.UnaryExpression);
      });
    });

    // See 11.13
    $.RULE('AssignmentExpression', () => {
      $.SUBRULE($.BinaryExpression);
      $.OPTION(() => {
        $.CONSUME(t.Pregunta);
        $.SUBRULE($.AssignmentExpression);
        $.CONSUME(t.DosPuntos);
        $.SUBRULE2($.AssignmentExpression);
      });
    });

    // See 11.13
    $.RULE('AssignmentExpressionNoIn', () => {
      $.SUBRULE($.BinaryExpressionNoIn);
      $.OPTION(() => {
        $.CONSUME(t.Pregunta);
        $.SUBRULE($.AssignmentExpression);
        $.CONSUME(t.DosPuntos);
        $.SUBRULE2($.AssignmentExpressionNoIn);
      });
    });

    // See 11.14
    $.RULE('Expression', () => {
      $.SUBRULE($.AssignmentExpression);
      $.MANY(() => {
        $.CONSUME(t.Coma);
        $.SUBRULE2($.AssignmentExpression);
      });
    });

    // See 11.14
    $.RULE('ExpressionNoIn', () => {
      $.SUBRULE($.AssignmentExpressionNoIn);
      $.MANY(() => {
        $.CONSUME(t.Coma);
        $.SUBRULE2($.AssignmentExpressionNoIn);
      });
    });

    // A.4 Statements

    // See clause 12
    $.RULE('Statement', () => {
      $.OR(
        $.c2
          || ($.c2 = [
            { ALT: () => $.SUBRULE($.Block) },
            { ALT: () => $.SUBRULE($.VariableStatement) },
            { ALT: () => $.SUBRULE($.EmptyStatement) },
            // "LabelledStatement" must appear before "ExpressionStatement" due to common lookahead prefix ("inner :" vs "inner")
            // The ambiguity is resolved by the ordering of the alternatives
            // See: https://ecma-international.org/ecma-262/5.1/#sec-12.4
            //   - [lookahead ∉ {{, function}]
            {
              ALT: () => $.SUBRULE($.ExpressionStatement),
              IGNORE_AMBIGUITIES: true,
            },
            { ALT: () => $.SUBRULE($.IfStatement) },
            { ALT: () => $.SUBRULE($.IterationStatement) },
            { ALT: () => $.SUBRULE($.ContinueStatement) },
            { ALT: () => $.SUBRULE($.BreakStatement) },
            { ALT: () => $.SUBRULE($.ReturnStatement) },
          ]),
      );
    });

    // See 12.1
    $.RULE('Block', () => {
      $.CONSUME(t.CorcheteIzquierdo);
      $.OPTION(() => {
        $.SUBRULE($.StatementList);
      });
      $.CONSUME(t.CorcheteDerecho);
    });

    // See 12.1
    $.RULE('StatementList', () => {
      $.AT_LEAST_ONE(() => {
        $.SUBRULE($.Statement);
      });
    });

    // See 12.2
    $.RULE('VariableStatement', () => {
      $.CONSUME(t.Crear);
      $.SUBRULE($.VariableDeclarationList);
      $.CONSUME(t.DosPuntos, ENABLE_SEMICOLON_INSERTION);
    });

    // See 12.2
    $.RULE('VariableDeclarationList', () => {
      $.SUBRULE($.VariableDeclaration);
      $.MANY(() => {
        $.CONSUME(t.Coma);
        $.SUBRULE2($.VariableDeclaration);
      });
    });

    // // See 12.2
    $.RULE('VariableDeclarationListNoIn', () => {
      // needed to distinguish between for and for-in
      let numOfVars = 1;
      $.SUBRULE($.VariableDeclarationNoIn);
      $.MANY(() => {
        $.CONSUME(t.Coma);
        $.SUBRULE2($.VariableDeclarationNoIn);
        numOfVars++;
      });
      return numOfVars;
    });

    // See 12.2
    $.RULE('VariableDeclaration', () => {
      $.CONSUME(t.Identificador);
      $.OPTION(() => {
        $.SUBRULE($.Initialiser);
      });
    });

    // // See 12.2
    $.RULE('VariableDeclarationNoIn', () => {
      $.CONSUME(t.Identificador);
      $.OPTION(() => {
        $.SUBRULE($.InitialiserNoIn);
      });
    });

    // See 12.2
    $.RULE('Initialiser', () => {
      $.CONSUME(t.Es);
      $.SUBRULE($.AssignmentExpression);
    });

    // See 12.2
    $.RULE('InitialiserNoIn', () => {
      $.CONSUME(t.Es);
      $.SUBRULE($.AssignmentExpressionNoIn);
    });

    // See 12.3
    $.RULE('EmptyStatement', () => {
      //  a semicolon is never inserted automatically if the semicolon would then be parsed as an empty statement
      $.CONSUME(t.PuntoComa, DISABLE_SEMICOLON_INSERTION);
    });

    // See 12.4
    $.RULE('ExpressionStatement', () => {
      // the spec defines [lookahead ? {{, function}] to avoid some ambiguities, however those ambiguities only exist
      // because in a BNF grammar there is no priority between alternatives. This implementation however, is deterministic
      // the first alternative found to match will be taken. thus these ambiguities can be resolved
      // by ordering the alternatives
      $.SUBRULE($.Expression);
      $.CONSUME(t.PuntoComa, ENABLE_SEMICOLON_INSERTION);
    });

    // See 12.5
    $.RULE('IfStatement', () => {
      $.CONSUME(t.Si);
      $.CONSUME(t.ParentesisIzquierdo);
      $.SUBRULE($.Expression);
      $.CONSUME(t.ParentesisDerecho);
      $.SUBRULE($.Statement);
      // refactoring spec to use an OPTION production for the 'else'
      // to resolve the dangling if-else problem
      $.OPTION(() => {
        $.CONSUME(t.CasoContrario);
        $.SUBRULE2($.Statement);
      });
    });

    // See 12.6
    $.RULE('IterationStatement', () => {
      // the original spec rule has been refactored into 3 smaller ones
      $.OR([
        { ALT: () => $.SUBRULE($.DoIteration) },
        { ALT: () => $.SUBRULE($.WhileIteration) },
      ]);
    });

    $.RULE('DoIteration', () => {
      $.CONSUME(t.Hacer);
      $.SUBRULE($.Statement);
      $.CONSUME(t.Mientras);
      $.CONSUME(t.ParentesisIzquierdo);
      $.SUBRULE($.Expression);
      $.CONSUME(t.ParentesisDerecho);
      $.CONSUME(t.PuntoComa, ENABLE_SEMICOLON_INSERTION);
    });

    $.RULE('WhileIteration', () => {
      $.CONSUME(t.Mientras);
      $.CONSUME(t.ParentesisIzquierdo);
      $.SUBRULE($.Expression);
      $.CONSUME(t.ParentesisDerecho);
      $.SUBRULE($.Statement);
    });

    // See 12.7
    $.RULE('ContinueStatement', () => {
      $.CONSUME(t.Continuar);
      $.OPTION({
        GATE: this.noLineTerminatorHere,
        DEF: () => {
          $.CONSUME(t.Identificador);
        },
      });
      $.CONSUME(t.PuntoComa, ENABLE_SEMICOLON_INSERTION);
    });

    // See 12.8
    $.RULE('BreakStatement', () => {
      $.CONSUME(t.Parar);
      $.OPTION({
        GATE: this.noLineTerminatorHere,
        DEF: () => {
          $.CONSUME(t.Identificador);
        },
      });
      $.CONSUME(t.PuntoComa, ENABLE_SEMICOLON_INSERTION);
    });

    // See 12.9
    $.RULE('ReturnStatement', () => {
      $.CONSUME(t.Retornar);
      $.OPTION({
        GATE: this.noLineTerminatorHere,
        DEF: () => {
          $.SUBRULE($.Expression);
        },
      });
      $.CONSUME(t.PuntoComa, ENABLE_SEMICOLON_INSERTION);
    });

    // A.5 Functions and Programs

    // See clause 13
    $.RULE('FunctionDeclaration', () => {
      $.CONSUME(t.Funcion);
      $.CONSUME(t.Identificador);
      $.CONSUME(t.ParentesisIzquierdo);
      $.OPTION(() => {
        $.SUBRULE($.FormalParameterList);
      });
      $.CONSUME(t.ParentesisDerecho);
      $.CONSUME(t.CorcheteIzquierdo);
      $.SUBRULE($.SourceElements); // FunctionBody(clause 13) is equivalent to SourceElements
      $.CONSUME(t.CorcheteDerecho);
    });

    // See clause 13
    $.RULE('FunctionExpression', () => {
      $.CONSUME(t.Funcion);
      $.OPTION1(() => {
        $.CONSUME(t.Identificador);
      });
      $.CONSUME(t.ParentesisIzquierdo);
      $.OPTION2(() => {
        $.SUBRULE($.FormalParameterList);
      });
      $.CONSUME(t.ParentesisDerecho);
      $.CONSUME(t.CorcheteIzquierdo);
      $.SUBRULE($.SourceElements); // FunctionBody(clause 13) is equivalent to SourceElements
      $.CONSUME(t.CorcheteDerecho);
    });

    // See clause 13
    $.RULE('FormalParameterList', () => {
      $.CONSUME(t.Identificador);
      $.MANY(() => {
        $.CONSUME(t.Coma);
        $.CONSUME2(t.Identificador);
      });
    });

    // See clause 14
    $.RULE('Program', () => {
      $.SUBRULE($.SourceElements);
    });

    // See clause 14
    // this inlines SourceElementRule rule from the spec
    $.RULE('SourceElements', () => {
      $.MANY(() => {
        $.OR([
          // FunctionDeclaration appearing before statement implements [lookahead != {{, function}] in ExpressionStatement
          // See https://www.ecma-international.org/ecma-262/5.1/index.html#sec-12.4Declaration
          {
            ALT: () => $.SUBRULE($.FunctionDeclaration),
            IGNORE_AMBIGUITIES: true,
          },
          { ALT: () => $.SUBRULE($.Statement) },
        ]);
      });
    });

    this.performSelfAnalysis();
  }

  /*
   * Link https://www.ecma-international.org/ecma-262/5.1/#sec-7.9.1
   * Automatic semicolon insertion implementation.
   * The spec defines the insertion in terms of encountering an "offending"
   * token and then inserting a semicolon under one of three basic rules.
   * 1. Offending token is after a lineTerminator.
   * 2. Offending token is a '}' RCurly.
   * 3. Reached EOF but failed to parse a complete ECMAScript Program.
   *
   * In addition there are two overriding conditions on these rules.
   * 1. do not insert if the semicolon would then be parsed as an empty statement.
   * 2. do not If that semicolon would become one of the two semicolons in the header of a for statement.
   *
   * The implementation approaches this problem in a slightly different but equivalent approach:
   *
   * anytime a semicolon should be consumed AND
   * the nextToken is not a semicolon AND
   * the context is one that allows semicolon insertion (not in a for header or empty Statement) AND
   * one of the 3 basic rules match
   * ---------------------------------->
   * THEN insert a semicolon
   *
   * Note that the context information is passed as the 'trySemiColonInsertion' argument
   * to the CONSUME parsing DSL method
   */
  canAndShouldDoSemiColonInsertion() {
    const nextToken = this.LA(1);
    const isNextTokenSemiColon = tokenMatcher(nextToken, t.Semicolon);
    return (
      isNextTokenSemiColon === false
      && (this.lineTerminatorHere() // basic rule 1a and 3
      || tokenMatcher(nextToken, t.RCurly) // basic rule 1b
        || tokenMatcher(nextToken, EOF))
    ); // basic rule 2
  }

  // // TODO: performance: semicolon insertion costs 5-10% of runtime, can this be improved?
  CONSUME(tokClass, trySemiColonInsertion) {
    if (
      trySemiColonInsertion === true
      && this.canAndShouldDoSemiColonInsertion()
    ) {
      return insertedSemiColon;
    }
    return this.SUPER_CONSUME(tokClass);
  }

  CONSUME2(tokClass, trySemiColonInsertion) {
    if (
      trySemiColonInsertion === true
      && this.canAndShouldDoSemiColonInsertion()
    ) {
      return insertedSemiColon;
    }
    return this.SUPER_CONSUME2(tokClass);
  }

  // TODO: implement once the parser builds some data structure we can explore.
  // in the case of "for (x in y)" form.
  // the "IN" is only allowed if x is a left hand side expression
  // https://www.ecma-international.org/ecma-262/5.1/index.html#sec-12.6
  // so this method must verify that the exp parameter fulfills this condition.
  canInComeAfterExp(exp) {
    // TODO: temp implemntatoin, will always allow IN style iteration for now.
    return true;
  }

  noLineTerminatorHere() {
    return !this.lineTerminatorHere();
  }

  lineTerminatorHere() {
    const prevToken = this.LA(0);
    const nextToken = this.LA(1);
    const seekStart = prevToken.endOffset;
    const seekEnd = nextToken.startOffset - 1;

    let i = seekStart;
    while (i < seekEnd) {
      const code = this._orgText.charCodeAt(i);
      if (code === 10 || code === 13 || code === 0x2028 || code === 0x2029) {
        return true;
      }
      i++;
    }
    return false;
  }
}

const insertedSemiColon = {
  tokenTypeIdx: t.PuntoComa.tokenTypeIdx,
  image: ';',
  startOffset: NaN,
  endOffset: NaN,
  automaticallyInserted: true,
};

const parser = new UlaParser([]);

module.exports = parser;
