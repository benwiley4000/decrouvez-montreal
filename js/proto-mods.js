/*
 * String.prototype.endsWith implementation taken
 * from this StackOverflow answer: http://goo.gl/R4mrNA
 */

String.prototype.endsWith = function(suffix) {
	return this.indexOf(suffix, this.length - suffix.length) !== -1;
};