"""Boolean search on paper titles using pyparsing."""

import re
from pyparsing import (
    Word, alphanums, CaselessKeyword, Group, Forward, Suppress,
    OneOrMore, one_of, ParserElement,
)

ParserElement.enablePackrat()

_alphabet_ranges = [
    [0x0400, 0x04FF], [0x0600, 0x07FF], [0x0E00, 0x0E7F],
    [0x3040, 0x30FF], [0x3200, 0x32FF], [0x4E00, 0x9FFF],
    [0x1100, 0x11FF], [0x3130, 0x318F], [0xA960, 0xA97F],
    [0xAC00, 0xD7AF], [0xD7B0, 0xD7FF], [0xFF00, 0xFFEF],
]


class BooleanSearchParser:
    def __init__(self):
        self._methods = {
            "and": self._eval_and,
            "or": self._eval_or,
            "not": self._eval_not,
            "parenthesis": self._eval_paren,
            "quotes": self._eval_quotes,
            "word": self._eval_word,
        }
        self._parser = self._build_parser()
        self.text = ""
        self.words: list[str] = []

    def _build_parser(self):
        operatorOr = Forward()
        alphabet = alphanums
        for lo, hi in _alphabet_ranges:
            alphabet += "".join(chr(c) for c in range(lo, hi + 1) if not chr(c).isspace())

        operatorWord = Group(Word(alphabet + "*")).set_results_name("word*")
        operatorQuotesContent = Forward()
        operatorQuotesContent <<= (operatorWord + operatorQuotesContent) | operatorWord
        operatorQuotes = (
            Group(Suppress('"') + operatorQuotesContent + Suppress('"')).set_results_name("quotes")
            | operatorWord
        )
        operatorParenthesis = (
            Group(Suppress("(") + operatorOr + Suppress(")")).set_results_name("parenthesis")
            | operatorQuotes
        )
        operatorNot = Forward()
        operatorNot <<= (
            Group(Suppress(CaselessKeyword("not")) + operatorNot).set_results_name("not")
            | operatorParenthesis
        )
        operatorAnd = Forward()
        operatorAnd <<= (
            Group(operatorNot + Suppress(CaselessKeyword("and")) + operatorAnd).set_results_name("and")
            | Group(operatorNot + OneOrMore(~one_of("and or") + operatorAnd)).set_results_name("and")
            | operatorNot
        )
        operatorOr <<= (
            Group(operatorAnd + Suppress(CaselessKeyword("or")) + operatorOr).set_results_name("or")
            | operatorAnd
        )
        return operatorOr.parse_string

    # ---- evaluators ----
    def _eval_and(self, arg):
        for a in arg:
            found, tokens = self._evaluate(a)
            if not found:
                return False, set()
        return True, set()

    def _eval_or(self, arg):
        for a in arg:
            found, _ = self._evaluate(a)
            if found:
                return True, set()
        return False, set()

    def _eval_not(self, arg):
        found, _ = self._evaluate(arg[0])
        return not found, set()

    def _eval_paren(self, arg):
        return self._evaluate(arg[0])

    def _eval_quotes(self, arg):
        phrase = " ".join(tok[0] for tok in arg)
        return phrase.lower() in self.text.lower(), set()

    def _eval_word(self, arg):
        raw = arg[0].lower()
        if "*" in raw:
            pattern = raw.replace("*", ".*")
            for w in self.words:
                if re.match(pattern, w):
                    return True, set()
            return False, set()
        return raw in self.words, set()

    def _evaluate(self, arg):
        return self._methods[arg.getName()](arg)

    def match(self, text: str, expr: str) -> bool:
        self.text = text.lower()
        self.words = [w.lower() for w in re.split(r"[\s\-_/,;:\.]+", text) if w]
        try:
            parsed = self._parser(expr)[0]
            found, _ = self._evaluate(parsed)
            return found
        except Exception:
            return False


_parser_instance = BooleanSearchParser()


def boolean_search_titles(titles_with_meta: list[dict], expression: str) -> list[dict]:
    """Filter a list of paper dicts by boolean expression on title."""
    results = []
    for paper in titles_with_meta:
        title = paper.get("title", "")
        if _parser_instance.match(title, expression):
            results.append(paper)
    return results